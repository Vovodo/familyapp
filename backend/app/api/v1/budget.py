import calendar
from typing import List, Optional, Dict
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import extract, func
from backend.app.db.session import get_db
from backend.app.models.models import BudgetItem, User, FamilyMember
from backend.app.api.deps import get_current_user, get_current_family_member
from loguru import logger

router = APIRouter()


class BudgetCreate(BaseModel):
    type: str = Field(..., pattern="^(expense|income)$")
    amount: float = Field(..., gt=0)
    category: str = Field(default="Diğer", min_length=1, max_length=50)
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    transaction_date: Optional[datetime] = None


class BudgetResponse(BaseModel):
    id: str
    family_id: str
    created_by: str
    type: str
    amount: float
    category: str
    title: str
    description: Optional[str] = None
    transaction_date: datetime
    created_at: datetime
    creator_name: Optional[str] = None

    class Config:
        from_attributes = True


class CategoryBreakdown(BaseModel):
    category: str
    amount: float
    percentage: float
    count: int


class BudgetMonthlySummary(BaseModel):
    month: int
    year: int
    month_name: str
    total_income: float
    total_expense: float
    net_balance: float
    transaction_count: int
    categories: List[CategoryBreakdown]
    prev_month_expense: Optional[float] = None
    expense_change_percent: Optional[float] = None


TURKISH_MONTHS = {
    1: "Ocak", 2: "Şubat", 3: "Mart", 4: "Nisan", 5: "Mayıs", 6: "Haziran",
    7: "Temmuz", 8: "Ağustos", 9: "Eylül", 10: "Ekim", 11: "Kasım", 12: "Aralık"
}


def _enrich_budget(b: BudgetItem, db: Session) -> dict:
    creator = db.query(User).filter(User.id == b.created_by).first() if b.created_by else None
    return {
        "id": b.id,
        "family_id": b.family_id,
        "created_by": b.created_by,
        "type": b.type,
        "amount": round(float(b.amount), 2),
        "category": b.category or "Diğer",
        "title": b.title,
        "description": b.description,
        "transaction_date": b.transaction_date or b.created_at,
        "created_at": b.created_at,
        "creator_name": creator.full_name.split()[0] if creator else None,
    }


@router.get("/", response_model=List[BudgetResponse])
def list_transactions(
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=2020, le=2050),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member)
):
    """
    Returns all transactions for the family for a given month and year.
    Defaults to current month if not provided.
    """
    now = datetime.now(timezone.utc)
    target_month = month or now.month
    target_year = year or now.year

    query = db.query(BudgetItem).filter(
        BudgetItem.family_id == member.family_id,
        extract('month', BudgetItem.transaction_date) == target_month,
        extract('year', BudgetItem.transaction_date) == target_year
    ).order_by(BudgetItem.transaction_date.desc(), BudgetItem.created_at.desc())

    items = query.all()
    return [_enrich_budget(i, db) for i in items]


@router.get("/summary", response_model=BudgetMonthlySummary)
def get_monthly_summary(
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=2020, le=2050),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member)
):
    """
    Calculates monthly total income, expenses, net balance, and category breakdown.
    Also compares with previous month.
    """
    now = datetime.now(timezone.utc)
    target_month = month or now.month
    target_year = year or now.year

    # Current month items
    items = db.query(BudgetItem).filter(
        BudgetItem.family_id == member.family_id,
        extract('month', BudgetItem.transaction_date) == target_month,
        extract('year', BudgetItem.transaction_date) == target_year
    ).all()

    total_income = sum(float(i.amount) for i in items if i.type == "income")
    total_expense = sum(float(i.amount) for i in items if i.type == "expense")
    net_balance = total_income - total_expense

    # Category breakdown for expenses
    cat_map: Dict[str, Dict[str, float]] = {}
    for i in items:
        if i.type == "expense":
            cat = i.category or "Diğer"
            if cat not in cat_map:
                cat_map[cat] = {"amount": 0.0, "count": 0}
            cat_map[cat]["amount"] += float(i.amount)
            cat_map[cat]["count"] += 1

    categories: List[CategoryBreakdown] = []
    for cat, data in sorted(cat_map.items(), key=lambda x: x[1]["amount"], reverse=True):
        amt = round(data["amount"], 2)
        pct = round((amt / total_expense * 100), 1) if total_expense > 0 else 0.0
        categories.append(CategoryBreakdown(
            category=cat,
            amount=amt,
            percentage=pct,
            count=int(data["count"])
        ))

    # Previous month comparison
    prev_month = 12 if target_month == 1 else target_month - 1
    prev_year = target_year - 1 if target_month == 1 else target_year

    prev_items = db.query(BudgetItem).filter(
        BudgetItem.family_id == member.family_id,
        extract('month', BudgetItem.transaction_date) == prev_month,
        extract('year', BudgetItem.transaction_date) == prev_year,
        BudgetItem.type == "expense"
    ).all()

    prev_expense = sum(float(i.amount) for i in prev_items) if prev_items else 0.0
    expense_change = None
    if prev_expense > 0 and total_expense > 0:
        expense_change = round(((total_expense - prev_expense) / prev_expense) * 100, 1)

    return BudgetMonthlySummary(
        month=target_month,
        year=target_year,
        month_name=f"{TURKISH_MONTHS.get(target_month, str(target_month))} {target_year}",
        total_income=round(total_income, 2),
        total_expense=round(total_expense, 2),
        net_balance=round(net_balance, 2),
        transaction_count=len(items),
        categories=categories,
        prev_month_expense=round(prev_expense, 2) if prev_expense > 0 else None,
        expense_change_percent=expense_change
    )


@router.post("/", response_model=BudgetResponse, status_code=status.HTTP_201_CREATED)
def create_transaction(
    payload: BudgetCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member)
):
    """
    Adds a new income or expense transaction to the family budget.
    """
    tx_date = payload.transaction_date or datetime.now(timezone.utc)

    item = BudgetItem(
        family_id=member.family_id,
        created_by=current_user.id,
        type=payload.type,
        amount=round(payload.amount, 2),
        category=payload.category.strip(),
        title=payload.title.strip(),
        description=payload.description.strip() if payload.description else None,
        transaction_date=tx_date
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    logger.info(f"Budget item created: {item.type} ₺{item.amount} '{item.title}' in family {member.family_id}")
    return _enrich_budget(item, db)


@router.delete("/{item_id}", status_code=status.HTTP_200_OK)
def delete_transaction(
    item_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member)
):
    """
    Deletes a transaction from the budget.
    """
    item = db.query(BudgetItem).filter(
        BudgetItem.id == item_id,
        BudgetItem.family_id == member.family_id
    ).first()

    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Kayıt bulunamadı.")

    db.delete(item)
    db.commit()
    return {"status": "success", "message": "İşlem silindi."}
