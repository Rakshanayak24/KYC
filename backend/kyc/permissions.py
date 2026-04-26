from rest_framework.permissions import BasePermission


class IsMerchant(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.is_merchant()


class IsReviewer(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.is_reviewer()


class IsOwnerOrReviewer(BasePermission):
    """
    Merchants can only see their own submissions.
    Reviewers can see all submissions.
    This is enforced at queryset level in the view — this permission
    handles the object-level check as a second layer.
    """
    def has_object_permission(self, request, view, obj):
        if request.user.is_reviewer():
            return True
        return obj.merchant == request.user
