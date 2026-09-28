"""Explicit fictional fixtures for the ordinary demo account, never startup seeding."""
import argparse
import asyncio
from datetime import datetime, timedelta, timezone
import json

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session
from app.models.user import User
from app.models.site_content import SiteAdmin
from app.models.watchlist import WatchStock, WatchStage, StockMemo, EarningsEvent
from app.models.watchlist_research import WatchStockResearchSection, WatchResearchSectionKey
from app.models.note import Note, NoteSeries, ResearchLink
from app.models.asset import Asset, AssetZone, AssetCategory
from app.models.transaction import Transaction, TransactionType, TxStatus
from app.models.sell_batch_item import SellBatchItem
from app.models.trade_plan import TradePlan, PlanStatus
from app.models.cash_account import CashAccount
from app.models.custom_alert import AlertRule, AlertNotification

MARKER = "【演示】从这里开始：工作台体验指南 v1"
DISCLAIMER = "【演示】以下内容、价格锚点和交易均为虚构，只用于功能体验，不是投资建议。页面另行获取的行情可能是真实外部数据，不代表这些示例判断有效。"
STOCKS = [
    ("NVDA", "英伟达", "conviction", "美股", "半导体", "AI 基础设施", 110),
    ("AAPL", "苹果", "radar", "美股", "消费电子", "现金流观察", 190),
    ("MSFT", "微软", "conviction", "美股", "企业软件", "云与订阅", 420),
    ("GOOGL", "Alphabet", "radar", "美股", "互联网", "商业模式研究", 160),
    ("AMZN", "亚马逊", "radar", "美股", "电商与云", "经营效率", 180),
    ("VOO", "标普 500 ETF", "strike", "美股", "指数基金", "长期配置", 420),
    ("0700.HK", "腾讯控股", "conviction", "港股", "互联网", "资本配置", 360),
    ("600519.SH", "贵州茅台", "radar", "A股", "消费", "需求与渠道", 1400),
]


async def seed_demo(db: AsyncSession) -> dict:
    """One transaction; refuse clashes instead of modifying any existing record."""
    async with db.begin():
        user = await db.scalar(select(User).where(User.username == "demo"))
        if user is None:
            raise ValueError("Create the ordinary demo account first; this tool does not create accounts.")
        if await db.get(SiteAdmin, user.id):
            raise ValueError("Refusing to seed a privileged demo account.")
        if await db.scalar(select(Note.id).where(Note.user_id == user.id, Note.title == MARKER)):
            return {"already_seeded": True, "message": "No records changed."}
        symbols = [row[0] for row in STOCKS]
        if await db.scalar(select(WatchStock.id).where(WatchStock.user_id == user.id, WatchStock.symbol.in_(symbols))):
            raise ValueError("Existing watchlist symbols conflict. No records changed; inspect manually.")
        if await db.scalar(select(Asset.id).where(Asset.user_id == user.id, Asset.symbol.in_(["NVDA", "AAPL", "VOO", "DEMO-DEPOSIT", "DEMO-COURSE"]))):
            raise ValueError("Existing asset symbols conflict. No records changed.")
        topic_names = ["【演示】公司研究练习", "【演示】决策与复盘"]
        if await db.scalar(select(NoteSeries.id).where(NoteSeries.user_id == user.id, NoteSeries.name.in_(topic_names))):
            raise ValueError("Existing demo topics conflict. No records changed.")

        now = datetime.now(timezone.utc).replace(microsecond=0)
        stocks = {}
        for i, (symbol, name, stage, sector, industry, concept, price) in enumerate(STOCKS):
            stock = WatchStock(
                user_id=user.id, symbol=symbol, name=f"【演示】{name}", stage=WatchStage(stage), sector=sector,
                industries=[industry], concepts=[concept, "虚构演示"], current_price=price,
                fair_price=round(price*1.08, 2), strike_price=round(price*.9, 2), target_price=round(price*1.2, 2),
                planned_capital=3000 if sector=="美股" else 10000,
                inspiration=DISCLAIMER, entry_reason="【演示】先理解业务，再判断价格是否提供足够余地。",
                thesis=f"【演示】以{name}为练习对象：把需求、竞争与现金流拆成可验证的问题，不把股价上涨当作逻辑成立。",
                invalidation="【演示】若关键假设无法验证、现金流质量下降或竞争优势减弱，退回观察，不自动加仓。",
                business_summary="【演示】练习说明：记录客户是谁、产品解决什么问题、收入如何产生。具体业务请自行核实。",
                growth_drivers="【演示】练习拆解销量、价格、客户留存与经营效率，不填未经核验的预测数字。",
                fundamental_risks="【演示】关注需求变化、竞争、估值与集中度。",
                notes=DISCLAIMER, created_at=now-timedelta(days=20-i),
            )
            db.add(stock)
            await db.flush()
            stocks[symbol]=stock
            db.add(StockMemo(user_id=user.id,stock_id=stock.id,content="【演示】下一步：找一条支持证据和一条反对证据，写清需要核实的问题。",pinned=i==0))

        summaries = [
            "业务怎样创造价值？尝试用三句话说明客户、产品与收入来源。",
            "竞争优势是否可持续？分别寻找支持和反对的证据。",
            "增长能否转为现金流？区分假设、事实与尚未核实的数据。",
            "什么会让我改变判断？把失效条件写成可以观察的变化。",
            "什么条件下才行动？这里的价格锚点仅为虚构的界面演示。",
        ]
        for symbol in ["NVDA", "MSFT", "0700.HK"]:
            for section, summary in zip(WatchResearchSectionKey, summaries):
                db.add(WatchStockResearchSection(
                    user_id=user.id,stock_id=stocks[symbol].id,key=section,summary="【演示】"+summary,
                    evidence=[{"label":"演示说明","value":"尚未核实，不是公司事实","source":"Synthetic demo"}],
                    open_questions=[{"question":"【演示】哪一项证据最可能改变当前判断？","status":"open","answer":""}],
                    next_review_at=now+timedelta(days=7),review_note=DISCLAIMER,
                ))

        assets, buys = {}, {}
        asset_rows = [
            ("NVDA", "英伟达模拟持仓", AssetZone.ACTIVE, AssetCategory.STOCK, "us", 25, 100, 110),
            ("AAPL", "苹果模拟持仓", AssetZone.ACTIVE, AssetCategory.STOCK, "us", 10, 200, 190),
            ("VOO", "指数模拟配置", AssetZone.ACTIVE, AssetCategory.ETF, "us", 5, 400, 420),
            ("DEMO-DEPOSIT", "稳健储备示例", AssetZone.BASE, AssetCategory.DEPOSIT, "other", 1, 30000, 30000),
            ("DEMO-COURSE", "财报阅读课程", AssetZone.INVEST, AssetCategory.COURSE, "other", 1, 980, 0),
        ]
        for i,(symbol,name,zone,category,market,qty,cost,price) in enumerate(asset_rows):
            sold = 5 if symbol=="NVDA" else 0
            asset=Asset(user_id=user.id,symbol=symbol,name="【演示】"+name,zone=zone,category=category,market=market,
                        broker_cost=cost,mental_cost=cost,quantity=qty-sold,current_price=price,total_invested=qty*cost,
                        actual_investment=qty*cost,planned_investment=qty*cost*2,
                        total_cashed=50 if sold else 0,total_realized_pnl=50 if sold else 0,total_recovered=500 if sold else 0,
                        pinned=i==0,sort_order=i,created_at=now-timedelta(days=30-i))
            db.add(asset)
            await db.flush()
            assets[symbol]=asset
            buy=Transaction(asset_id=asset.id,tx_type=TransactionType.BUY,price=cost,quantity=qty,fee=0,
                            sold_quantity=sold,status=TxStatus.PARTIAL_SOLD if sold else TxStatus.HOLDING,
                            note="【演示】虚构买入，用于体验成本与批次记录。",created_at=now-timedelta(days=30-i))
            db.add(buy)
            await db.flush()
            buys[symbol]=buy
        sell=Transaction(asset_id=assets["NVDA"].id,tx_type=TransactionType.SELL,price=110,quantity=5,fee=0,
                         realized_profit=50,source_tx_id=buys["NVDA"].id,note="【演示】虚构部分卖出：5 × (110 − 100) = 50 USD。",
                         created_at=now-timedelta(days=3))
        db.add(sell)
        await db.flush()
        db.add(SellBatchItem(sell_tx_id=sell.id,buy_tx_id=buys["NVDA"].id,quantity=5))

        for i,symbol in enumerate(["NVDA", "AAPL", "VOO"]):
            price=float(assets[symbol].current_price)
            db.add(TradePlan(asset_id=assets[symbol].id,status=PlanStatus.ABANDONED if i==1 else PlanStatus.ACTIVE,
                             target_position=30,max_position=40,build_low=price*.85,build_high=price*.92,
                             stop_loss=price*.75,take_profit_1=price*1.2,
                             buy_strategy="【演示】先复核研究，再决定是否分批；这是虚构计划，不会自动下单。",
                             sell_strategy="【演示】记录减仓理由，不因单日波动机械执行。",note=DISCLAIMER))
        for currency,balance in [("USD",5000),("CNY",20000)]:
            db.add(CashAccount(user_id=user.id,name=f"【演示】{currency} 备用资金",currency=currency,balance=balance,note=DISCLAIMER))

        topics=[]
        for name in topic_names:
            topic=NoteSeries(user_id=user.id,name=name,description=DISCLAIMER,starred=True)
            db.add(topic)
            await db.flush()
            topics.append(topic)
        note_rows=[
            (MARKER,"quick",None,"先看股票池的三个阶段，再打开 NVDA 的研究卡片；去投资目录查看模拟持仓与部分卖出；最后查看暂停的提醒和示例通知。"),
            ("【演示】NVDA：把关注拆成三个待验证问题","company","NVDA","需求能持续多久？竞争会怎样影响定价？增长是否转化为现金流？这些都是研究问题，不是已证实的结论。"),
            ("【演示】MSFT：订阅业务研究模板","company","MSFT","分别记录客户留存、产品价值和经营效率。证据不足时保持观察，不以熟悉公司名称代替研究。"),
            ("【演示】指数配置：为什么先写预算","thesis","VOO","先明确资金用途与承受波动的能力，再考虑分批节奏；示例预算不是适合任何人的配置比例。"),
            ("【演示】AAPL：放弃一次加仓计划","decision","AAPL","原先想因价格回落加仓，但关键问题尚未解决，因此暂停计划。放弃行动也应该留下依据。"),
            ("【演示】NVDA：一次部分卖出的复盘","review","NVDA","虚构买入 25 股、每股 100，卖出 5 股、每股 110，手续费为 0：剩余 20 股，已实现收益 50。练习回看执行与事前计划的差异。"),
        ]
        for i,(title,kind,symbol,body) in enumerate(note_rows):
            topic=topics[0 if i<3 else 1]
            note=Note(user_id=user.id,title=title,kind=kind,status="active",confidence=3 if symbol else None,
                      content=f"> {DISCLAIMER}\n\n## 观察与思考\n\n{body}\n\n## 下一次检查\n\n- 找到可追溯的资料。\n- 写出反对自己的证据。\n- 信息不足时允许继续等待。",
                      stock_symbols=[symbol] if symbol else [],tags=["虚构演示","研究练习"],series=topic.name,series_id=topic.id,
                      starred=i==0,cover_color=["#12382c","#20334a","#39304c"][i%3],next_review_at=now+timedelta(days=i+1),
                      created_at=now-timedelta(days=6-i))
            db.add(note)
            await db.flush()
            if symbol:
                db.add(ResearchLink(user_id=user.id,note_id=note.id,entity_type="watch_stock",entity_id=stocks[symbol].id))

        rules=[]
        for period,scope,symbol,side in [(20,"watchlist",None,"both"),(60,"single","NVDA","above"),(120,"watchlist",None,"below")]:
            rule=AlertRule(user_id=user.id,stock_id=stocks[symbol].id if symbol else None,scope=scope,
                           name=f"【演示】{symbol or '全部股票池'} · SMA{period} 附近观察",period=period,tolerance=2 if period==20 else 3,
                           side=side,cooldown_minutes=1440,enabled=False,status="pending")
            db.add(rule)
            await db.flush()
            rules.append(rule)
        for i,symbol in enumerate(["NVDA","MSFT"]):
            db.add(AlertNotification(user_id=user.id,rule_id=rules[0].id,stock_id=stocks[symbol].id,symbol=symbol,
                                     rule_name="【演示通知】虚构均线接近示例，非真实触发",
                                     evidence={"price":101,"sma":100,"gap_pct":1,"period":20,"tolerance":2,"side":"both",
                                               "quote_at":int((now-timedelta(days=1)).timestamp()),"sma_through":(now-timedelta(days=2)).date().isoformat(),
                                               "currency":"USD","source":"Synthetic demo — not a real trigger"},
                                     created_at=now-timedelta(hours=i+1),read_at=now if i else None))
        for i,symbol in enumerate(["NVDA","MSFT","0700.HK"]):
            db.add(EarningsEvent(user_id=user.id,stock_id=stocks[symbol].id,event_date=(now+timedelta(days=7+i*5)).date(),
                                 fiscal_period="演示日期 / 非真实财报安排",note="【演示】虚构日历事件，仅展示界面；请另行核实真实财报日期。"))
    return {"already_seeded":False,"stocks":8,"assets":5,"transactions":6,"notes":6,"topics":2,
            "plans":3,"paused_alerts":3,"notifications":2,"cash_accounts":2,"research_sections":15,"memos":8,"calendar_events":3}


async def main():
    async with async_session() as db:
        print(json.dumps(await seed_demo(db),ensure_ascii=False))


if __name__ == "__main__":
    parser=argparse.ArgumentParser(description="Add fictional examples to the existing ordinary demo account only.")
    parser.add_argument("--confirm-demo",action="store_true",required=True,help="Confirm this database is a demo environment; back it up first.")
    parser.parse_args()
    try:
        asyncio.run(main())
    except ValueError as error:
        raise SystemExit(str(error)) from None
