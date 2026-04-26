from rest_framework import generics, status, views
from rest_framework.response import Response
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny, IsAuthenticated
from django.contrib.auth import authenticate
from django.db.models import Q, Avg, F, ExpressionWrapper, DurationField, Count
from django.utils import timezone
from datetime import timedelta

from .models import User, KYCSubmission, NotificationEvent
from .serializers import (
    UserRegistrationSerializer, UserSerializer,
    KYCSubmissionSerializer, StateTransitionSerializer,
    NotificationEventSerializer,
)
from .permissions import IsMerchant, IsReviewer, IsOwnerOrReviewer


def error_response(message, status_code=400):
    return Response({'error': message, 'status': status_code}, status=status_code)


class RegisterView(generics.CreateAPIView):
    permission_classes = [AllowAny]
    serializer_class = UserRegistrationSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        token, _ = Token.objects.get_or_create(user=user)
        return Response({
            'token': token.key,
            'user': UserSerializer(user).data,
        }, status=status.HTTP_201_CREATED)


class LoginView(views.APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get('username')
        password = request.data.get('password')
        user = authenticate(username=username, password=password)
        if not user:
            return error_response('Invalid credentials', 401)
        token, _ = Token.objects.get_or_create(user=user)
        return Response({'token': token.key, 'user': UserSerializer(user).data})


class MeView(views.APIView):
    def get(self, request):
        return Response(UserSerializer(request.user).data)


class KYCSubmissionListCreateView(generics.ListCreateAPIView):
    serializer_class = KYCSubmissionSerializer

    def get_queryset(self):
        user = self.request.user
        if user.is_reviewer():
            return KYCSubmission.objects.all().select_related('merchant', 'assigned_reviewer')
        # Merchants only see their own — enforced at queryset, not just object level
        return KYCSubmission.objects.filter(merchant=user).select_related('merchant')

    def perform_create(self, serializer):
        serializer.save(merchant=self.request.user)


class KYCSubmissionDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = KYCSubmissionSerializer
    permission_classes = [IsAuthenticated, IsOwnerOrReviewer]

    def get_queryset(self):
        user = self.request.user
        if user.is_reviewer():
            return KYCSubmission.objects.all().select_related('merchant', 'assigned_reviewer')
        # Second layer: queryset-level filter so merchant A cannot even resolve merchant B's ID
        return KYCSubmission.objects.filter(merchant=user)


class StateTransitionView(views.APIView):
    """
    POST /api/v1/submissions/{id}/transition/
    Handles all state changes. Enforces the state machine from the model.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            submission = KYCSubmission.objects.get(pk=pk)
        except KYCSubmission.DoesNotExist:
            return error_response('Submission not found', 404)

        # Authorization: merchants can only transition their own; reviewers can do all
        if request.user.is_merchant() and submission.merchant != request.user:
            return error_response('Not authorized to modify this submission', 403)

        # Merchants can only submit (draft → submitted)
        # Reviewers can do the rest
        serializer = StateTransitionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({'error': serializer.errors}, status=400)

        new_state = serializer.validated_data['new_state']
        reviewer_note = serializer.validated_data.get('reviewer_note', '')

        # Merchants can only move to submitted
        if request.user.is_merchant() and new_state != KYCSubmission.SUBMITTED:
            return error_response('Merchants can only submit their KYC (draft → submitted)', 403)

        try:
            submission.transition_to(new_state, actor=request.user)
        except ValueError as e:
            return error_response(str(e))

        if reviewer_note:
            submission.reviewer_note = reviewer_note

        # Assign reviewer if moving to under_review
        if new_state == KYCSubmission.UNDER_REVIEW and not submission.assigned_reviewer:
            submission.assigned_reviewer = request.user

        submission.save()

        # Log notification event
        NotificationEvent.objects.create(
            merchant=submission.merchant,
            event_type=f'kyc_state_changed_to_{new_state}',
            payload={
                'submission_id': submission.pk,
                'old_state': serializer.validated_data['new_state'],
                'new_state': new_state,
                'reviewer_note': reviewer_note,
                'actor': request.user.username,
            }
        )

        return Response(KYCSubmissionSerializer(submission).data)


class ReviewerDashboardView(views.APIView):
    """
    GET /api/v1/dashboard/
    Queue + metrics for reviewer dashboard.
    """
    permission_classes = [IsReviewer]

    def get(self, request):
        now = timezone.now()
        seven_days_ago = now - timedelta(days=7)
        at_risk_threshold = now - timedelta(hours=24)

        # Queue: submissions that need reviewer attention, oldest first
        queue = KYCSubmission.objects.filter(
            state__in=[KYCSubmission.SUBMITTED, KYCSubmission.UNDER_REVIEW]
        ).select_related('merchant').order_by('submitted_at', 'created_at')

        # Annotate at_risk dynamically — no stored flag that can go stale
        queue_data = []
        for sub in queue:
            s = KYCSubmissionSerializer(sub).data
            queue_data.append(s)

        # Metrics
        total_in_queue = queue.count()

        # Average time in queue (for submitted/under_review): now - submitted_at
        # We compute in Python to stay DB-agnostic (SQLite doesn't do interval math well)
        time_in_queue_hours = []
        for sub in queue:
            ref = sub.submitted_at or sub.created_at
            if ref:
                hours = (now - ref).total_seconds() / 3600
                time_in_queue_hours.append(hours)
        avg_time_in_queue_hours = (
            round(sum(time_in_queue_hours) / len(time_in_queue_hours), 1)
            if time_in_queue_hours else 0
        )

        # Approval rate last 7 days
        recent = KYCSubmission.objects.filter(updated_at__gte=seven_days_ago)
        recent_approved = recent.filter(state=KYCSubmission.APPROVED).count()
        recent_rejected = recent.filter(state=KYCSubmission.REJECTED).count()
        resolved = recent_approved + recent_rejected
        approval_rate = round((recent_approved / resolved) * 100, 1) if resolved else None

        return Response({
            'metrics': {
                'total_in_queue': total_in_queue,
                'avg_time_in_queue_hours': avg_time_in_queue_hours,
                'approval_rate_last_7_days': approval_rate,
                'recent_approved': recent_approved,
                'recent_rejected': recent_rejected,
            },
            'queue': queue_data,
        })


class NotificationListView(generics.ListAPIView):
    serializer_class = NotificationEventSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.is_reviewer():
            return NotificationEvent.objects.all().select_related('merchant')
        return NotificationEvent.objects.filter(merchant=user)
