from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.models.models import ShoppingItem, User, FamilyMember
from backend.app.schemas.schemas import (
    ShoppingItemCreate,
    ShoppingItemUpdate,
    ShoppingItemResponse
)
from backend.app.api.deps import get_current_user, get_current_family_member

router = APIRouter()


@router.get("/", response_model=List[ShoppingItemResponse])
def get_shopping_items(
    db: Session = Depends(get_db),
    member: FamilyMember = Depends(get_current_family_member)
):
    """
    Returns all shopping items for the family, sorted with active items first.
    """
    items = (
        db.query(ShoppingItem)
        .filter(ShoppingItem.family_id == member.family_id)
        .order_by(ShoppingItem.is_completed.asc(), ShoppingItem.created_at.desc())
        .all()
    )

    results = []
    for item in items:
        creator = db.query(User).filter(User.id == item.created_by).first()
        completed_user = db.query(User).filter(User.id == item.completed_by).first() if item.completed_by else None
        results.append(
            ShoppingItemResponse(
                id=item.id,
                family_id=item.family_id,
                created_by=item.created_by,
                completed_by=item.completed_by,
                title=item.title,
                quantity=item.quantity,
                category=item.category,
                is_completed=item.is_completed,
                completed_at=item.completed_at,
                created_at=item.created_at,
                creator_name=creator.full_name if creator else "Aile Üyesi",
                completed_by_name=completed_user.full_name if completed_user else None
            )
        )
    return results


@router.post("/", response_model=ShoppingItemResponse, status_code=status.HTTP_201_CREATED)
def create_shopping_item(
    item_in: ShoppingItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member)
):
    """
    Adds a new item to the family shopping list.
    """
    item = ShoppingItem(
        family_id=member.family_id,
        created_by=current_user.id,
        title=item_in.title,
        quantity=item_in.quantity,
        category=item_in.category
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    return ShoppingItemResponse(
        id=item.id,
        family_id=item.family_id,
        created_by=item.created_by,
        completed_by=None,
        title=item.title,
        quantity=item.quantity,
        category=item.category,
        is_completed=item.is_completed,
        completed_at=None,
        created_at=item.created_at,
        creator_name=current_user.full_name,
        completed_by_name=None
    )


@router.patch("/{item_id}", response_model=ShoppingItemResponse)
def update_shopping_item(
    item_id: str,
    item_in: ShoppingItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member)
):
    """
    Updates item properties or toggles completion status.
    """
    item = (
        db.query(ShoppingItem)
        .filter(ShoppingItem.id == item_id, ShoppingItem.family_id == member.family_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ürün bulunamadı.")

    if item_in.title is not None:
        item.title = item_in.title
    if item_in.quantity is not None:
        item.quantity = item_in.quantity
    if item_in.category is not None:
        item.category = item_in.category
    if item_in.is_completed is not None:
        item.is_completed = item_in.is_completed
        if item.is_completed:
            item.completed_by = current_user.id
            item.completed_at = datetime.now(timezone.utc)
        else:
            item.completed_by = None
            item.completed_at = None

    db.commit()
    db.refresh(item)

    creator = db.query(User).filter(User.id == item.created_by).first()
    completed_user = db.query(User).filter(User.id == item.completed_by).first() if item.completed_by else None

    return ShoppingItemResponse(
        id=item.id,
        family_id=item.family_id,
        created_by=item.created_by,
        completed_by=item.completed_by,
        title=item.title,
        quantity=item.quantity,
        category=item.category,
        is_completed=item.is_completed,
        completed_at=item.completed_at,
        created_at=item.created_at,
        creator_name=creator.full_name if creator else "Aile Üyesi",
        completed_by_name=completed_user.full_name if completed_user else None
    )


@router.delete("/completed")
def clear_completed(
    db: Session = Depends(get_db),
    member: FamilyMember = Depends(get_current_family_member)
):
    """
    Clears all completed items from the shopping list.
    """
    deleted_count = (
        db.query(ShoppingItem)
        .filter(ShoppingItem.family_id == member.family_id, ShoppingItem.is_completed == True)
        .delete()
    )
    db.commit()
    return {"message": f"{deleted_count} tamamlanan ürün temizlendi."}


@router.delete("/{item_id}")
def delete_shopping_item(
    item_id: str,
    db: Session = Depends(get_db),
    member: FamilyMember = Depends(get_current_family_member)
):
    """
    Deletes a specific item from the shopping list.
    """
    item = (
        db.query(ShoppingItem)
        .filter(ShoppingItem.id == item_id, ShoppingItem.family_id == member.family_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ürün bulunamadı.")

    db.delete(item)
    db.commit()
    return {"message": "Ürün silindi."}
