"""
Tests for KYC state machine and authorization.
Run: python manage.py test kyc.tests
"""
from django.test import TestCase
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APITestCase, APIClient
from rest_framework.authtoken.models import Token
from rest_framework import status

from kyc.models import KYCSubmission, KYCState, UserProfile


def make_user(username, role='merchant'):
    user = User.objects.create_user(username=username, password='pass123')
    UserProfile.objects.create(user=user, role=role)
    token = Token.objects.create(user=user)
    return user, token


class StateMachineUnitTests(TestCase):
    """Pure unit tests — no HTTP, just model logic."""

    def test_legal_transitions(self):
        legal = [
            (KYCState.DRAFT, KYCState.SUBMITTED),
            (KYCState.SUBMITTED, KYCState.UNDER_REVIEW),
            (KYCState.UNDER_REVIEW, KYCState.APPROVED),
            (KYCState.UNDER_REVIEW, KYCState.REJECTED),
            (KYCState.UNDER_REVIEW, KYCState.MORE_INFO_REQUESTED),
            (KYCState.MORE_INFO_REQUESTED, KYCState.SUBMITTED),
        ]
        for from_s, to_s in legal:
            self.assertTrue(
                KYCState.can_transition(from_s, to_s),
                f"Expected legal: {from_s} -> {to_s}"
            )

    def test_illegal_transitions(self):
        illegal = [
            (KYCState.APPROVED, KYCState.DRAFT),
            (KYCState.APPROVED, KYCState.SUBMITTED),
            (KYCState.REJECTED, KYCState.APPROVED),
            (KYCState.DRAFT, KYCState.APPROVED),
            (KYCState.DRAFT, KYCState.UNDER_REVIEW),
            (KYCState.SUBMITTED, KYCState.APPROVED),
            (KYCState.MORE_INFO_REQUESTED, KYCState.APPROVED),
        ]
        for from_s, to_s in illegal:
            self.assertFalse(
                KYCState.can_transition(from_s, to_s),
                f"Expected illegal: {from_s} -> {to_s}"
            )

    def test_validate_transition_raises_value_error(self):
        with self.assertRaises(ValueError) as ctx:
            KYCState.validate_transition(KYCState.APPROVED, KYCState.DRAFT)
        self.assertIn("approved", str(ctx.exception))
        self.assertIn("draft", str(ctx.exception))

    def test_submission_transition_to_updates_state(self):
        user = User.objects.create_user(username='testmerchant', password='pass')
        UserProfile.objects.create(user=user, role='merchant')
        sub = KYCSubmission.objects.create(merchant=user, state=KYCState.DRAFT)
        sub.transition_to(KYCState.SUBMITTED)
        sub.refresh_from_db()
        self.assertEqual(sub.state, KYCState.SUBMITTED)
        self.assertIsNotNone(sub.submitted_at)

    def test_illegal_transition_raises_on_model(self):
        user = User.objects.create_user(username='testmerchant2', password='pass')
        UserProfile.objects.create(user=user, role='merchant')
        sub = KYCSubmission.objects.create(merchant=user, state=KYCState.APPROVED)
        with self.assertRaises(ValueError):
            sub.transition_to(KYCState.DRAFT)

    def test_sla_at_risk_flag(self):
        from datetime import timedelta
        user = User.objects.create_user(username='testmerchant3', password='pass')
        UserProfile.objects.create(user=user, role='merchant')
        sub = KYCSubmission.objects.create(
            merchant=user,
            state=KYCState.SUBMITTED,
            submitted_at=timezone.now() - timedelta(hours=25),
        )
        self.assertTrue(sub.is_at_risk)

    def test_not_at_risk_when_recent(self):
        from datetime import timedelta
        user = User.objects.create_user(username='testmerchant4', password='pass')
        UserProfile.objects.create(user=user, role='merchant')
        sub = KYCSubmission.objects.create(
            merchant=user,
            state=KYCState.SUBMITTED,
            submitted_at=timezone.now() - timedelta(hours=5),
        )
        self.assertFalse(sub.is_at_risk)


class StateTransitionAPITests(APITestCase):
    """Integration tests via the API layer."""

    def setUp(self):
        self.merchant_user, self.merchant_token = make_user('m1', 'merchant')
        self.reviewer_user, self.reviewer_token = make_user('r1', 'reviewer')
        self.client = APIClient()

    def auth_merchant(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.merchant_token.key}')

    def auth_reviewer(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.reviewer_token.key}')

    def create_submission(self, state=KYCState.DRAFT):
        return KYCSubmission.objects.create(merchant=self.merchant_user, state=state)

    def test_illegal_transition_approved_to_draft_returns_400(self):
        """Core requirement: illegal transitions must return 400 with clear message."""
        sub = self.create_submission(KYCState.APPROVED)
        self.auth_reviewer()
        resp = self.client.post(
            f'/api/v1/reviewer/submissions/{sub.pk}/transition/',
            {'new_state': KYCState.DRAFT},
            format='json'
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(resp.data['error'])
        self.assertIn('approved', resp.data['message'])

    def test_merchant_cannot_approve(self):
        """Merchants cannot call reviewer endpoints."""
        sub = self.create_submission(KYCState.UNDER_REVIEW)
        self.auth_merchant()
        resp = self.client.post(
            f'/api/v1/reviewer/submissions/{sub.pk}/transition/',
            {'new_state': KYCState.APPROVED},
            format='json'
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_merchant_cannot_see_other_merchant_submission(self):
        """Merchant isolation: merchant B cannot see merchant A's submission."""
        other_user = User.objects.create_user(username='m2', password='pass')
        UserProfile.objects.create(user=other_user, role='merchant')
        sub = KYCSubmission.objects.create(merchant=other_user, state=KYCState.DRAFT)

        self.auth_merchant()
        resp = self.client.get(f'/api/v1/submissions/{sub.pk}/')
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_submit_happy_path(self):
        sub = self.create_submission(KYCState.DRAFT)
        self.auth_merchant()
        resp = self.client.post(f'/api/v1/submissions/{sub.pk}/submit/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['state'], KYCState.SUBMITTED)

    def test_double_approve_returns_400(self):
        sub = self.create_submission(KYCState.APPROVED)
        self.auth_reviewer()
        resp = self.client.post(
            f'/api/v1/reviewer/submissions/{sub.pk}/transition/',
            {'new_state': KYCState.APPROVED},
            format='json'
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reviewer_can_see_all_submissions(self):
        other = User.objects.create_user(username='m3', password='pass')
        UserProfile.objects.create(user=other, role='merchant')
        sub = KYCSubmission.objects.create(merchant=other, state=KYCState.SUBMITTED)
        self.auth_reviewer()
        resp = self.client.get('/api/v1/reviewer/queue/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        ids = [s['id'] for s in resp.data]
        self.assertIn(sub.pk, ids)
