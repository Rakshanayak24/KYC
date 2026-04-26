from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User, KYCSubmission, NotificationEvent

admin.site.register(User, UserAdmin)
admin.site.register(KYCSubmission)
admin.site.register(NotificationEvent)
