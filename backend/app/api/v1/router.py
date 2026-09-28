from fastapi import APIRouter
from app.api.v1.auth import router as auth_router
from app.api.v1.assets import router as assets_router
from app.api.v1.transactions import router as transactions_router
from app.api.v1.dashboard import router as dashboard_router
from app.api.v1.trade_plans import router as trade_plans_router
from app.api.v1.finance import router as finance_router
from app.api.v1.cash_account import router as cash_account_router
from app.api.v1.import_tx import router as import_router
from app.api.v1.ibkr_import import router as ibkr_import_router
from app.api.v1.exchange_rates import router as exchange_rates_router
from app.api.v1.tags import router as tags_router
from app.api.v1.prices import router as prices_router
from app.api.v1.data_reset import router as data_reset_router
from app.api.v1.notes import router as notes_router
from app.api.v1.watchlist import router as watchlist_router
from app.api.v1.workbench import router as workbench_router
from app.api.v1.investment_tools import router as investment_tools_router
from app.api.v1.quant_strategies import router as quant_strategies_router

api_router = APIRouter(prefix="/api/v1")
from app.api.v1.research_guides import router as research_guides_router
api_router.include_router(research_guides_router)
from app.api.v1.site_content import router as site_content_router
api_router.include_router(site_content_router)
from app.api.v1.custom_alerts import router as custom_alerts_router
api_router.include_router(custom_alerts_router)

api_router.include_router(auth_router)
api_router.include_router(assets_router)
api_router.include_router(transactions_router)
api_router.include_router(dashboard_router)
api_router.include_router(trade_plans_router)
api_router.include_router(finance_router)
api_router.include_router(cash_account_router)
api_router.include_router(import_router)
api_router.include_router(ibkr_import_router)
api_router.include_router(exchange_rates_router)
api_router.include_router(tags_router)
api_router.include_router(prices_router)
api_router.include_router(data_reset_router)
api_router.include_router(notes_router)
api_router.include_router(watchlist_router)
api_router.include_router(workbench_router)
api_router.include_router(investment_tools_router)
api_router.include_router(quant_strategies_router)
