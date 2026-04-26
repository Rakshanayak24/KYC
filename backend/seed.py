"""
Seed script: creates 2 merchants and 1 reviewer with test KYC submissions.
Run: python seed.py
"""
import os, sys, django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'playto.settings')
sys.path.insert(0, os.path.dirname(__file__))
django.setup()

from django.contrib.auth import get_user_model
from rest_framework.authtoken.models import Token
from kyc.models import KYCSubmission, NotificationEvent
from django.utils import timezone

User = get_user_model()

print("🌱 Seeding database...")

# Reviewer
reviewer, _ = User.objects.get_or_create(username='reviewer1', defaults={'role': 'reviewer', 'email': 'reviewer@playto.so'})
reviewer.set_password('review123')
reviewer.save()
r_token, _ = Token.objects.get_or_create(user=reviewer)
print(f"✅ Reviewer: reviewer1 / review123 | Token: {r_token.key}")

# Merchant 1 — draft state
m1, _ = User.objects.get_or_create(username='merchant1', defaults={'role': 'merchant', 'email': 'alice@example.com'})
m1.set_password('merchant123')
m1.save()
m1_token, _ = Token.objects.get_or_create(user=m1)
sub1, created = KYCSubmission.objects.get_or_create(
    merchant=m1,
    defaults={
        'full_name': 'Alice Sharma',
        'email': 'alice@example.com',
        'phone': '+919876543210',
        'business_name': 'Alice Designs',
        'business_type': 'Freelancer',
        'expected_monthly_volume': 2000.00,
        'state': KYCSubmission.DRAFT,
    }
)
if not created:
    sub1.state = KYCSubmission.DRAFT
    sub1.save()
print(f"✅ Merchant 1: merchant1 / merchant123 | Token: {m1_token.key} | Submission state: draft")

# Merchant 2 — under_review state (simulate time passing)
m2, _ = User.objects.get_or_create(username='merchant2', defaults={'role': 'merchant', 'email': 'bob@example.com'})
m2.set_password('merchant456')
m2.save()
m2_token, _ = Token.objects.get_or_create(user=m2)
sub2, created = KYCSubmission.objects.get_or_create(
    merchant=m2,
    defaults={
        'full_name': 'Bob Verma',
        'email': 'bob@example.com',
        'phone': '+919812345678',
        'business_name': 'Verma Digital Agency',
        'business_type': 'Agency',
        'expected_monthly_volume': 15000.00,
        'state': KYCSubmission.UNDER_REVIEW,
        'submitted_at': timezone.now() - timezone.timedelta(hours=30),  # triggers at_risk
        'assigned_reviewer': reviewer,
    }
)
if not created:
    sub2.state = KYCSubmission.UNDER_REVIEW
    sub2.submitted_at = timezone.now() - timezone.timedelta(hours=30)
    sub2.assigned_reviewer = reviewer
    sub2.save()

# Log a notification for the state change
NotificationEvent.objects.get_or_create(
    merchant=m2,
    event_type='kyc_state_changed_to_under_review',
    defaults={
        'payload': {
            'submission_id': sub2.pk,
            'new_state': 'under_review',
            'actor': reviewer.username,
        }
    }
)
print(f"✅ Merchant 2: merchant2 / merchant456 | Token: {m2_token.key} | Submission state: under_review (AT RISK - 30h old)")

print("\n🎉 Seed complete!")
print(f"\nReviewer dashboard: GET /api/v1/dashboard/ with Token {r_token.key}")
