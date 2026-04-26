# EXPLAINER.md

## 1. The State Machine

The state machine lives entirely in `backend/kyc/models.py` inside the `KYCSubmission` model. It is the single source of truth — no transition logic lives in views or serializers.

```python
# kyc/models.py — KYCSubmission

LEGAL_TRANSITIONS = {
    DRAFT: [SUBMITTED],
    SUBMITTED: [UNDER_REVIEW],
    UNDER_REVIEW: [APPROVED, REJECTED, MORE_INFO_REQUESTED],
    MORE_INFO_REQUESTED: [SUBMITTED],
    APPROVED: [],
    REJECTED: [],
}

def transition_to(self, new_state, actor=None):
    """
    Central state machine. Raises ValueError on illegal transitions.
    This is the ONLY place transitions happen.
    """
    legal = self.LEGAL_TRANSITIONS.get(self.state, [])
    if new_state not in legal:
        raise ValueError(
            f"Illegal transition: '{self.state}' → '{new_state}'. "
            f"Legal options from '{self.state}': {legal or ['none']}"
        )
    self.state = new_state
    if new_state == self.SUBMITTED and not self.submitted_at:
        self.submitted_at = timezone.now()
```

The view (`StateTransitionView.post`) calls `submission.transition_to(new_state)` and catches `ValueError`, returning a 400 with the message. This means:
- Adding a new state only requires updating `LEGAL_TRANSITIONS`
- You can't accidentally bypass the check in a different endpoint
- The error message tells the caller exactly what went wrong and what's allowed

---

## 2. The Upload

File validation lives in `backend/kyc/serializers.py` in the `validate_document()` function, which is called by each `validate_<field>` method on the serializer.

```python
ALLOWED_EXTENSIONS = {'pdf', 'jpg', 'jpeg', 'png'}
ALLOWED_MIMETYPES = {'application/pdf', 'image/jpeg', 'image/png'}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB

def validate_document(file: UploadedFile):
    if file is None:
        return file

    # Size check first — cheapest operation
    if file.size > MAX_FILE_SIZE:
        raise serializers.ValidationError(
            f"File '{file.name}' is {file.size // (1024*1024)} MB. Maximum allowed size is 5 MB."
        )

    # Extension check — extracted from file name, not client-supplied type
    ext = os.path.splitext(file.name)[1].lstrip('.').lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise serializers.ValidationError(
            f"File type '.{ext}' is not allowed. Accepted types: PDF, JPG, PNG."
        )

    # Content-type check — secondary layer, not fully trusted
    content_type = getattr(file, 'content_type', '')
    if content_type and content_type not in ALLOWED_MIMETYPES:
        raise serializers.ValidationError(
            f"Content type '{content_type}' is not allowed."
        )

    return file
```

**What happens with a 50 MB file?** Django's `DATA_UPLOAD_MAX_MEMORY_SIZE` is set to 5 MB in `settings.py`. A 50 MB file will raise `RequestDataTooBig` before the serializer is even invoked — Django rejects it at the middleware layer. The serializer's size check is a second layer for files under the Django limit but claimed to exceed 5 MB.

---

## 3. The Queue

The queue query is in `backend/kyc/views.py` in `ReviewerDashboardView.get`:

```python
queue = KYCSubmission.objects.filter(
    state__in=[KYCSubmission.SUBMITTED, KYCSubmission.UNDER_REVIEW]
).select_related('merchant').order_by('submitted_at', 'created_at')
```

**Why this way?**

- `filter(state__in=[...])` — only shows actionable submissions, not drafts/closed ones
- `select_related('merchant')` — avoids N+1 queries when serializing merchant username
- `order_by('submitted_at', 'created_at')` — oldest first, matching FIFO queue semantics; `created_at` as tiebreaker for submissions that haven't been formally submitted yet

**SLA / at_risk flag:**

```python
@property
def is_at_risk(self):
    """Dynamically computed — never stored, always fresh."""
    if self.state not in (self.SUBMITTED, self.UNDER_REVIEW):
        return False
    reference = self.submitted_at or self.created_at
    if reference is None:
        return False
    return (timezone.now() - reference).total_seconds() > 86400  # 24 hours
```

This is computed in Python (not as a DB annotation) for two reasons:
1. SQLite doesn't support interval arithmetic natively
2. It never goes stale — every request recomputes it from `timezone.now()`

---

## 4. The Auth

There are two layers preventing merchant A from seeing merchant B's submission.

**Layer 1 — Queryset filter (primary):**

```python
# KYCSubmissionDetailView.get_queryset
def get_queryset(self):
    user = self.request.user
    if user.is_reviewer():
        return KYCSubmission.objects.all()
    # Merchant only gets their own submissions
    return KYCSubmission.objects.filter(merchant=user)
```

If merchant A requests `/api/v1/submissions/5/` and that submission belongs to merchant B, `get_queryset()` returns a queryset that doesn't include it. DRF's `get_object()` calls `.get()` on that queryset and raises `Http404`. The merchant sees a 404, not a 403 — this avoids confirming the resource exists.

**Layer 2 — Object-level permission (backup):**

```python
# permissions.py
class IsOwnerOrReviewer(BasePermission):
    def has_object_permission(self, request, view, obj):
        if request.user.is_reviewer():
            return True
        return obj.merchant == request.user
```

Even if the queryset check were somehow bypassed (e.g., through a future admin action), the object-level permission fires and returns 403.

---

## 5. The AI Audit

**Tool used:** Claude (Anthropic)

**What it generated for the reviewer dashboard SLA query:**

```python
# AI's version — computed an annotation in Django ORM
from django.utils import timezone
from django.db.models import ExpressionWrapper, DurationField, F

queue = KYCSubmission.objects.filter(
    state__in=['submitted', 'under_review']
).annotate(
    time_in_queue=ExpressionWrapper(
        timezone.now() - F('submitted_at'),
        output_field=DurationField()
    ),
    is_at_risk=Case(
        When(time_in_queue__gt=timedelta(hours=24), then=Value(True)),
        default=Value(False),
        output_field=BooleanField()
    )
).order_by('submitted_at')
```

**The bug I caught:** This works on PostgreSQL but **silently fails on SQLite** (which we default to in development). SQLite doesn't support `DurationField` arithmetic the same way — the annotation either crashes or returns `None` for all rows. This would make `is_at_risk` always `False` in dev, so the bug would be invisible until production.

**What I replaced it with:** Moved `is_at_risk` to a `@property` on the model, computed in Python from `timezone.now()`. This is DB-agnostic, always correct, and tested the same way in SQLite and Postgres. The tradeoff is it can't be used in `.filter()` — but for this dashboard, we only need it for display, so that's fine.

---

## What I'd improve with more time

1. **Magic-byte file validation** — currently validates by extension + content-type. True security would read the first few bytes of the file and check the magic number (e.g., `%PDF`, `\xff\xd8` for JPEG). Would add `python-magic` for this.
2. **Reviewer round-robin assignment** — currently assigns the reviewer who clicks "Start Review". Would add a `get_next_reviewer()` function that picks the reviewer with the fewest active submissions.
3. **Real email notifications** — `NotificationEvent` records what *should* be sent. Connecting this to SendGrid or SES would be a small step.
4. **Pagination** — the queue endpoint returns all results. For large queues, cursor-based pagination would be needed.
5. **Audit log** — a separate `StateTransitionLog` model tracking who made each transition and when, rather than just the current state.
