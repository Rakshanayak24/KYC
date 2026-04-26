from django.db import models
from django.contrib.auth.models import AbstractUser
from django.utils import timezone


class User(AbstractUser):
    ROLE_MERCHANT = 'merchant'
    ROLE_REVIEWER = 'reviewer'
    ROLE_CHOICES = [(ROLE_MERCHANT, 'Merchant'), (ROLE_REVIEWER, 'Reviewer')]
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default=ROLE_MERCHANT)

    def is_merchant(self):
        return self.role == self.ROLE_MERCHANT

    def is_reviewer(self):
        return self.role == self.ROLE_REVIEWER


class KYCSubmission(models.Model):
    # States
    DRAFT = 'draft'
    SUBMITTED = 'submitted'
    UNDER_REVIEW = 'under_review'
    APPROVED = 'approved'
    REJECTED = 'rejected'
    MORE_INFO_REQUESTED = 'more_info_requested'

    STATE_CHOICES = [
        (DRAFT, 'Draft'),
        (SUBMITTED, 'Submitted'),
        (UNDER_REVIEW, 'Under Review'),
        (APPROVED, 'Approved'),
        (REJECTED, 'Rejected'),
        (MORE_INFO_REQUESTED, 'More Info Requested'),
    ]

    # The single source of truth for legal transitions
    LEGAL_TRANSITIONS = {
        DRAFT: [SUBMITTED],
        SUBMITTED: [UNDER_REVIEW],
        UNDER_REVIEW: [APPROVED, REJECTED, MORE_INFO_REQUESTED],
        MORE_INFO_REQUESTED: [SUBMITTED],
        APPROVED: [],
        REJECTED: [],
    }

    merchant = models.ForeignKey(User, on_delete=models.CASCADE, related_name='kyc_submissions')
    assigned_reviewer = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name='assigned_submissions'
    )

    # Personal details
    full_name = models.CharField(max_length=255, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=20, blank=True)

    # Business details
    business_name = models.CharField(max_length=255, blank=True)
    business_type = models.CharField(max_length=100, blank=True)
    expected_monthly_volume = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)

    # Documents
    pan_document = models.FileField(upload_to='kyc_docs/', null=True, blank=True)
    aadhaar_document = models.FileField(upload_to='kyc_docs/', null=True, blank=True)
    bank_statement = models.FileField(upload_to='kyc_docs/', null=True, blank=True)

    # State & tracking
    state = models.CharField(max_length=30, choices=STATE_CHOICES, default=DRAFT)
    reviewer_note = models.TextField(blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['submitted_at', 'created_at']

    @property
    def is_at_risk(self):
        """Dynamically compute SLA risk — never stored, always fresh."""
        if self.state not in (self.SUBMITTED, self.UNDER_REVIEW):
            return False
        reference = self.submitted_at or self.created_at
        if reference is None:
            return False
        return (timezone.now() - reference).total_seconds() > 86400  # 24 hours

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

    def __str__(self):
        return f"KYC #{self.pk} — {self.merchant.username} [{self.state}]"


class NotificationEvent(models.Model):
    merchant = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications')
    event_type = models.CharField(max_length=100)
    timestamp = models.DateTimeField(auto_now_add=True)
    payload = models.JSONField(default=dict)

    class Meta:
        ordering = ['-timestamp']

    def __str__(self):
        return f"{self.event_type} for {self.merchant.username} at {self.timestamp}"
