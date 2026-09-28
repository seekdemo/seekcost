"""交易记录批量导入 — Schema 定义"""
from pydantic import BaseModel


class ImportColumnMapping(BaseModel):
    """用户指定的 CSV 列 → 系统字段映射"""
    symbol: str          # 代码列名
    name: str | None = None  # 名称列名（可选，无则从 symbol 推断）
    tx_type: str         # 买卖方向列名
    price: str           # 成交价列名
    quantity: str        # 成交数量列名
    fee: str | None = None   # 手续费列名（可选）
    date: str | None = None  # 成交日期列名（可选）
    note: str | None = None  # 备注列名（可选）


class ImportPreviewRequest(BaseModel):
    """预览请求 — 携带列映射和类型配置"""
    mapping: ImportColumnMapping
    zone: str = "active"         # 新建资产默认区域
    category: str = "stock"      # 新建资产默认类别
    date_format: str = ""        # 日期格式（空=自动推断）
    buy_keyword: str = "买入"    # 识别为买入的关键词
    sell_keyword: str = "卖出"   # 识别为卖出的关键词


class ImportPreviewRow(BaseModel):
    """解析后的单行预览"""
    row_num: int              # 原始行号
    symbol: str
    name: str
    tx_type: str              # buy / sell
    price: float
    quantity: float
    fee: float
    date: str                 # ISO 格式日期字符串
    note: str
    is_duplicate: bool = False  # 是否与已有交易重复
    duplicate_reason: str = ""  # 重复原因描述
    error: str = ""             # 解析错误信息
    asset_exists: bool = False  # 该 symbol 是否已存在
    asset_id: int | None = None  # 已存在时的资产ID


class ImportPreviewResponse(BaseModel):
    """预览响应 — 展示解析结果供用户确认"""
    total_rows: int
    valid_rows: int
    error_rows: int
    duplicate_rows: int
    new_assets: list[str]      # 需要新建的资产 symbol 列表
    existing_assets: list[str] # 已存在的资产 symbol 列表
    rows: list[ImportPreviewRow]
    columns: list[str]         # CSV 原始列名（用于前端映射）
    session_id: str            # 会话ID，确认导入时回传


class ImportConfirmRequest(BaseModel):
    """确认导入请求"""
    session_id: str
    skip_duplicates: bool = True          # 是否跳过重复行
    skip_errors: bool = True              # 是否跳过解析错误行
    selected_rows: list[int] | None = None  # 仅导入指定行号（None=全部有效行）


class ImportConfirmResponse(BaseModel):
    """导入结果"""
    imported_count: int        # 成功导入的交易数
    skipped_count: int         # 跳过的行数
    new_assets_created: int    # 新创建的资产数
    errors: list[str]          # 导入过程中的错误