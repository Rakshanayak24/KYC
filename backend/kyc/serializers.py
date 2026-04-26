from rest_framework import serializers
from django.core.files.uploadedfile import UploadedFile
from .models import User, KYCSubmission, NotificationEvent
import os

ALLOWED_EXTENSIONS = {'pdf', 'jpg', 'jpeg', 'png'}
ALLOWED_MIMETYPES = {'application/pdf', 'image/jpeg', 'image/png'}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB


def validate_document(file: UploadedFile):
    """
    Validate file type by extension AND content-type header.
    Size capped at 5 MB. Does not trust client-supplied content-type alone.
    """
    if file is None:
        return file

    # Size check
    if file.size > MAX_FILE_SIZE:
        raise serializers.ValidationError(
            f"File '{file.name}' is {file.size // (1024*1024)} MB. Maximum allowed size is 5 MB."
        )

    # Extension check
    ext = os.path.splitext(file.name)[1].lstrip('.').lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise serializers.ValidationError(
            f"File type '.{ext}' is not allowed. Accepted types: PDF, JPG, PNG."
        )

    # Content-type check (not fully trusted but adds a layer)
    content_type = getattr(file, 'content_type', '')
    if content_type and content_type not in ALLOWED_MIMETYPES:
        raise serializers.ValidationError(
            f"Content type '{content_type}' is not allowed."
        )

    return file


class UserRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ['username', 'email', 'password', 'role']
        extra_kwargs = {'role': {'read_only': True}}

    def create(self, validated_data):
        user = User.objects.create_user(**validated_data)
        return user


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'role']


class KYCSubmissionSerializer(serializers.ModelSerializer):
    is_at_risk = serializers.SerializerMethodField()
    merchant_username = serializers.CharField(source='merchant.username', read_only=True)

    pan_document = serializers.FileField(required=False, allow_null=True)
    aadhaar_document = serializers.FileField(required=False, allow_null=True)
    bank_statement = serializers.FileField(required=False, allow_null=True)

    class Meta:
        model = KYCSubmission
        fields = [
            'id', 'merchant', 'merchant_username', 'assigned_reviewer',
            'full_name', 'email', 'phone',
            'business_name', 'business_type', 'expected_monthly_volume',
            'pan_document', 'aadhaar_document', 'bank_statement',
            'state', 'reviewer_note', 'submitted_at', 'created_at', 'updated_at',
            'is_at_risk',
        ]
        read_only_fields = ['id', 'merchant', 'state', 'submitted_at', 'created_at', 'updated_at', 'is_at_risk']

    def get_is_at_risk(self, obj):
        return obj.is_at_risk

    def validate_pan_document(self, value):
        return validate_document(value)

    def validate_aadhaar_document(self, value):
        return validate_document(value)

    def validate_bank_statement(self, value):
        return validate_document(value)


class StateTransitionSerializer(serializers.Serializer):
    new_state = serializers.CharField()
    reviewer_note = serializers.CharField(required=False, allow_blank=True)

    def validate_new_state(self, value):
        valid_states = [s[0] for s in KYCSubmission.STATE_CHOICES]
        if value not in valid_states:
            raise serializers.ValidationError(f"'{value}' is not a valid state.")
        return value


class NotificationEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationEvent
        fields = ['id', 'merchant', 'event_type', 'timestamp', 'payload']
