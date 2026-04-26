from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status


def custom_exception_handler(exc, context):
    """
    Returns consistent error shapes:
    {
      "error": true,
      "message": "...",
      "detail": {...} or null
    }
    """
    response = exception_handler(exc, context)

    if response is not None:
        data = response.data
        # Normalise DRF's varied error shapes
        if isinstance(data, dict) and 'detail' in data:
            message = str(data['detail'])
            detail = None
        elif isinstance(data, dict):
            message = "Validation error"
            detail = data
        elif isinstance(data, list):
            message = data[0] if data else "Error"
            detail = None
        else:
            message = str(data)
            detail = None

        response.data = {
            'error': True,
            'message': message,
            'detail': detail,
        }
        return response

    # Handle ValueError from state machine
    if isinstance(exc, ValueError):
        return Response(
            {'error': True, 'message': str(exc), 'detail': None},
            status=status.HTTP_400_BAD_REQUEST,
        )

    return None
