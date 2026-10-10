"""API router aggregator.

Every feature router is included into :data:`api_router`, which ``main.py`` mounts
at ``/api/v1``. Phase 2 adds e.g.::

    from app.routers import auth
    api_router.include_router(auth.router)
"""

from fastapi import APIRouter

from app.routers import (
    analytics,
    auth,
    billing_plans,
    bills,
    business_profile,
    customers,
    payments,
    public,
    uploads,
    webhooks,
)

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(business_profile.router)
api_router.include_router(uploads.router)
api_router.include_router(customers.router)
api_router.include_router(billing_plans.router)
api_router.include_router(bills.router)
api_router.include_router(payments.router)
api_router.include_router(webhooks.router)
api_router.include_router(public.router)
api_router.include_router(analytics.router)

__all__ = ["api_router"]
