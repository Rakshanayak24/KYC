from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework.authtoken.models import Token
from kyc.models import KYCSubmission

User = get_user_model()


class StateMachineTests(TestCase):
    def setUp(self):
        self.merchant = User.objects.create_user(username='merchant1', password='pass1234', role='merchant')
        self.reviewer = User.objects.create_user(username='reviewer1', password='pass1234', role='reviewer')
        self.m_token = Token.objects.create(user=self.merchant)
        self.r_token = Token.objects.create(user=self.reviewer)
        self.submission = KYCSubmission.objects.create(
            merchant=self.merchant,
            full_name='Test Merchant',
            email='test@example.com',
            state=KYCSubmission.DRAFT,
        )

    def _client(self, token):
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        return c

    def test_illegal_transition_draft_to_approved_returns_400(self):
        """A reviewer cannot jump draft → approved. Must follow the state machine."""
        client = self._client(self.r_token)
        resp = client.post(
            f'/api/v1/submissions/{self.submission.pk}/transition/',
            {'new_state': 'approved'},
            format='json',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('Illegal transition', resp.data['error'])

    def test_legal_transition_draft_to_submitted(self):
        """Merchant can move their draft to submitted."""
        client = self._client(self.m_token)
        resp = client.post(
            f'/api/v1/submissions/{self.submission.pk}/transition/',
            {'new_state': 'submitted'},
            format='json',
        )
        self.assertEqual(resp.status_code, 200)
        self.submission.refresh_from_db()
        self.assertEqual(self.submission.state, 'submitted')

    def test_illegal_transition_approved_to_draft(self):
        """Once approved, cannot move back to draft."""
        self.submission.state = KYCSubmission.APPROVED
        self.submission.save()
        client = self._client(self.r_token)
        resp = client.post(
            f'/api/v1/submissions/{self.submission.pk}/transition/',
            {'new_state': 'draft'},
            format='json',
        )
        self.assertEqual(resp.status_code, 400)

    def test_merchant_cannot_see_other_merchant_submission(self):
        """Merchant A cannot access Merchant B's submission."""
        merchant2 = User.objects.create_user(username='merchant2', password='pass1234', role='merchant')
        token2 = Token.objects.create(user=merchant2)
        client = self._client(token2)
        resp = client.get(f'/api/v1/submissions/{self.submission.pk}/')
        self.assertEqual(resp.status_code, 404)

    def test_full_happy_path(self):
        """draft → submitted → under_review → approved"""
        m_client = self._client(self.m_token)
        r_client = self._client(self.r_token)

        r = m_client.post(f'/api/v1/submissions/{self.submission.pk}/transition/', {'new_state': 'submitted'}, format='json')
        self.assertEqual(r.status_code, 200)

        r = r_client.post(f'/api/v1/submissions/{self.submission.pk}/transition/', {'new_state': 'under_review'}, format='json')
        self.assertEqual(r.status_code, 200)

        r = r_client.post(f'/api/v1/submissions/{self.submission.pk}/transition/', {'new_state': 'approved', 'reviewer_note': 'All good!'}, format='json')
        self.assertEqual(r.status_code, 200)

        self.submission.refresh_from_db()
        self.assertEqual(self.submission.state, 'approved')

    def test_more_info_requested_cycle(self):
        """under_review → more_info_requested → submitted"""
        self.submission.state = KYCSubmission.UNDER_REVIEW
        self.submission.save()
        r_client = self._client(self.r_token)
        m_client = self._client(self.m_token)

        r = r_client.post(f'/api/v1/submissions/{self.submission.pk}/transition/', {'new_state': 'more_info_requested', 'reviewer_note': 'Need PAN'}, format='json')
        self.assertEqual(r.status_code, 200)

        r = m_client.post(f'/api/v1/submissions/{self.submission.pk}/transition/', {'new_state': 'submitted'}, format='json')
        self.assertEqual(r.status_code, 200)
