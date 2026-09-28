"""
税收计算引擎 — 支持中国、美国、自定义
所有计算均按月薪制，年度累计税通过 month_index(1-12) 模拟
"""
import json
from dataclasses import dataclass


@dataclass
class SalaryBreakdown:
    """工资拆解结果"""
    gross: float           # 税前
    social_insurance: float  # 社保
    housing_fund: float    # 公积金
    tax: float             # 个税
    net: float             # 到手


# ══════════════════════ 中国个税 ══════════════════════

# 2024 累进税率表（年度应纳税所得额）
CN_BRACKETS = [
    (36000,   0.03, 0),
    (144000,  0.10, 2520),
    (300000,  0.20, 16920),
    (420000,  0.25, 31920),
    (660000,  0.30, 52920),
    (960000,  0.35, 85920),
    (float("inf"), 0.45, 181920),
]

CN_THRESHOLD = 5000  # 月起征点


def calc_cn_salary(
    gross: float,
    month_index: int = 1,
    pension_rate: float = 0.08,
    medical_rate: float = 0.02,
    unemployment_rate: float = 0.005,
    housing_fund_rate: float = 0.12,
    special_deduction: float = 0,
) -> SalaryBreakdown:
    """
    中国工资计算（累计预扣法）
    month_index: 1-12，第几个月（用于年度累计税计算）
    """
    # 五险一金
    si = gross * (pension_rate + medical_rate + unemployment_rate)
    hf = gross * housing_fund_rate
    total_deduct = si + hf

    # 累计预扣法
    cum_income = gross * month_index
    cum_deduct = total_deduct * month_index
    cum_threshold = CN_THRESHOLD * month_index
    cum_special = special_deduction * month_index
    cum_taxable = cum_income - cum_deduct - cum_threshold - cum_special
    if cum_taxable <= 0:
        return SalaryBreakdown(gross=gross, social_insurance=round(si, 2),
                               housing_fund=round(hf, 2), tax=0,
                               net=round(gross - total_deduct, 2))

    # 查税率
    cum_tax = 0.0
    for upper, rate, quick_deduct in CN_BRACKETS:
        if cum_taxable <= upper:
            cum_tax = cum_taxable * rate - quick_deduct
            break

    # 本月应缴 = 累计应缴 - 前几月已缴
    prev_months = month_index - 1
    if prev_months > 0:
        prev_cum_taxable = (gross * prev_months) - (total_deduct * prev_months) - (CN_THRESHOLD * prev_months) - (special_deduction * prev_months)
        prev_tax = 0.0
        if prev_cum_taxable > 0:
            for upper, rate, quick_deduct in CN_BRACKETS:
                if prev_cum_taxable <= upper:
                    prev_tax = prev_cum_taxable * rate - quick_deduct
                    break
        tax = max(cum_tax - prev_tax, 0)
    else:
        tax = max(cum_tax, 0)

    tax = round(tax, 2)
    net = round(gross - total_deduct - tax, 2)
    return SalaryBreakdown(gross=gross, social_insurance=round(si, 2),
                           housing_fund=round(hf, 2), tax=tax, net=net)


# ══════════════════════ 美国联邦税 ══════════════════════

# 2024 单身联邦税率表（年度）
US_BRACKETS = [
    (11600,  0.10),
    (47150,  0.12),
    (100525, 0.22),
    (191950, 0.24),
    (243725, 0.32),
    (609350, 0.35),
    (float("inf"), 0.37),
]

US_STANDARD_DEDUCTION = 14600   # 2024 单身标准扣除
US_SS_RATE = 0.062              # Social Security 6.2%
US_SS_CAP = 168600              # 2024 上限
US_MEDICARE_RATE = 0.0145       # Medicare 1.45%


def calc_us_salary(gross_monthly: float) -> SalaryBreakdown:
    """美国月薪计算（简化：联邦税 + FICA，不含州税）"""
    annual = gross_monthly * 12

    # FICA
    ss = min(annual, US_SS_CAP) * US_SS_RATE / 12
    mc = gross_monthly * US_MEDICARE_RATE
    si = round(ss + mc, 2)

    # 联邦所得税（年度 → 月度）
    taxable_annual = max(annual - US_STANDARD_DEDUCTION, 0)
    annual_tax = 0.0
    prev_upper = 0
    for upper, rate in US_BRACKETS:
        if taxable_annual <= 0:
            break
        bracket_income = min(taxable_annual, upper - prev_upper)
        annual_tax += bracket_income * rate
        taxable_annual -= bracket_income
        prev_upper = upper

    tax = round(annual_tax / 12, 2)
    net = round(gross_monthly - si - tax, 2)
    return SalaryBreakdown(gross=gross_monthly, social_insurance=si,
                           housing_fund=0, tax=tax, net=net)


# ══════════════════════ 自定义税率 ══════════════════════

def calc_custom_salary(
    gross: float,
    custom_tax_rate: float | None = None,
    custom_deductions: float | None = None,
    custom_brackets: str | None = None,
) -> SalaryBreakdown:
    """自定义税率计算"""
    deductions = custom_deductions or 0
    taxable = max(gross - deductions, 0)

    if custom_tax_rate is not None:
        # 固定税率
        tax = round(taxable * custom_tax_rate, 2)
    elif custom_brackets:
        # 累进税率表
        brackets = json.loads(custom_brackets)
        tax = 0.0
        for b in sorted(brackets, key=lambda x: x["min"]):
            lo = b["min"]
            hi = b.get("max", float("inf"))
            rate = b["rate"]
            if taxable <= lo:
                break
            bracket_income = min(taxable, hi) - lo
            tax += bracket_income * rate
        tax = round(tax, 2)
    else:
        tax = 0.0

    net = round(gross - tax, 2)
    return SalaryBreakdown(gross=gross, social_insurance=0, housing_fund=0,
                           tax=tax, net=net)