from django.urls import path
from .views import (
    RegisterView, LoginView, MeView,
    KYCSubmissionListCreateView, KYCSubmissionDetailView,
    StateTransitionView, ReviewerDashboardView, NotificationListView,
)

urlpatterns = [
    path('auth/register/', RegisterView.as_view(), name='register'),
    path('auth/login/', LoginView.as_view(), name='login'),
    path('auth/me/', MeView.as_view(), name='me'),
    path('submissions/', KYCSubmissionListCreateView.as_view(), name='submission-list'),
    path('submissions/<int:pk>/', KYCSubmissionDetailView.as_view(), name='submission-detail'),
    path('submissions/<int:pk>/transition/', StateTransitionView.as_view(), name='submission-transition'),
    path('dashboard/', ReviewerDashboardView.as_view(), name='reviewer-dashboard'),
    path('notifications/', NotificationListView.as_view(), name='notifications'),
]
