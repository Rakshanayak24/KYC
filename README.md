# Playto KYC Pipeline

A full-stack KYC (Know Your Customer) onboarding system for Playto Pay. Merchants submit verification documents, reviewers approve or reject submissions through a state-machine-enforced workflow.

## Stack

- **Backend:** Django 4.2 + Django REST Framework
- **Frontend:** React 18 + React Router
- **Database:** SQLite (local) / PostgreSQL (production)
- **Auth:** DRF Token Authentication

## Local Setup

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

python manage.py migrate
python seed.py         # Creates test users and submissions
python manage.py runserver
```

Backend runs at: http://localhost:8000

### Frontend

```bash
cd frontend
npm install
npm start
```

Frontend runs at: http://localhost:3000

## Seed Credentials

| Role     | Username  | Password    |
|----------|-----------|-------------|
| Reviewer | reviewer1 | review123   |
| Merchant | merchant1 | merchant123 |
| Merchant | merchant2 | merchant456 |

- `merchant1` has a **draft** submission
- `merchant2` has an **under_review** submission (30h old → AT RISK)

## API Reference

All endpoints under `/api/v1/`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register/` | Register merchant |
| POST | `/auth/login/` | Get token |
| GET | `/auth/me/` | Current user |
| GET/POST | `/submissions/` | List / create submissions |
| GET/PATCH | `/submissions/{id}/` | Detail / update |
| POST | `/submissions/{id}/transition/` | Change state |
| GET | `/dashboard/` | Reviewer queue + metrics |
| GET | `/notifications/` | Event log |

### State Transitions

```
draft → submitted → under_review → approved
                                 → rejected
                                 → more_info_requested → submitted
```

### Transition Request

```json
POST /api/v1/submissions/1/transition/
{
  "new_state": "approved",
  "reviewer_note": "All documents verified."
}
```

### Error Shape

```json
{
  "error": "Illegal transition: 'approved' → 'draft'. Legal options from 'approved': ['none']",
  "status": 400
}
```

## Running Tests

```bash
cd backend
python manage.py test kyc.tests
```

## Deployment

### Render

1. Create a **Web Service** pointing to the `backend/` directory
2. Build command: `pip install -r requirements.txt && python manage.py migrate && python seed.py`
3. Start command: `gunicorn playto.wsgi`
4. Add env vars: `SECRET_KEY`, `DATABASE_URL`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`

### Frontend (Vercel/Netlify)

1. Root: `frontend/`
2. Build: `npm run build`
3. Set `REACT_APP_API_URL` to your backend URL

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SECRET_KEY` | Django secret key |
| `DATABASE_URL` | Postgres connection string |
| `ALLOWED_HOSTS` | Comma-separated allowed hosts |
| `CORS_ALLOWED_ORIGINS` | Comma-separated frontend origins |
| `DEBUG` | `True` or `False` |
