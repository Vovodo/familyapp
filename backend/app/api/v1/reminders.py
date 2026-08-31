from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.models.models import Reminder, User, FamilyMember
from backend.app.schemas.schemas import (
    ReminderCreate,
    ReminderUpdate,
    ReminderResponse
)
from backend.app.api.deps import get_current_user, get_current_family_member

router = APIRouter()


@router.get("/", response_model=List[ReminderResponse])
def get_reminders(
    include_completed: bool = False,
    db: Session = Depends(get_db),
    member: FamilyMember = Depends(get_current_family_member)
):
    """
    Returns all reminders for the family, sorted by remind_at.
    """
    query = db.query(Reminder).filter(Reminder.family_id == member.family_id)
    if not include_completed:
        query = query.filter(Reminder.is_completed == False)

    reminders = query.order_by(Reminder.remind_at.asc()).all()

    results = []
    for r in reminders:
        creator = db.query(User).filter(User.id == r.creator_id).first()
        results.append(
            ReminderResponse(
                id=r.id,
                family_id=r.family_id,
                creator_id=r.creator_id,
                title=r.title,
                description=r.description,
                remind_at=r.remind_at,
                repeat_interval=r.repeat_interval,
                notify_before_minutes=r.notify_before_minutes,
                is_completed=r.is_completed,
                created_at=r.created_at,
                creator_name=creator.full_name if creator else "Aile Üyesi"
            )
        )
    return results


@router.post("/", response_model=ReminderResponse, status_code=status.HTTP_201_CREATED)
def create_reminder(
    reminder_in: ReminderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member)
):
    """
    Creates a new reminder.
    """
    reminder = Reminder(
        family_id=member.family_id,
        creator_id=current_user.id,
        title=reminder_in.title,
        description=reminder_in.description,
        remind_at=reminder_in.remind_at,
        repeat_interval=reminder_in.repeat_interval,
        notify_before_minutes=reminder_in.notify_before_minutes
    )
    db.add(reminder)
    db.commit()
    db.refresh(reminder)

    return ReminderResponse(
        id=reminder.id,
        family_id=reminder.family_id,
        creator_id=reminder.creator_id,
        title=reminder.title,
        description=reminder.description,
        remind_at=reminder.remind_at,
        repeat_interval=reminder.repeat_interval,
        notify_before_minutes=reminder.notify_before_minutes,
        is_completed=reminder.is_completed,
        created_at=reminder.created_at,
        creator_name=current_user.full_name
    )


@router.patch("/{reminder_id}", response_model=ReminderResponse)
def update_reminder(
    reminder_id: str,
    reminder_in: ReminderUpdate,
    db: Session = Depends(get_db),
    member: FamilyMember = Depends(get_current_family_member)
):
    """
    Updates a reminder or marks it as completed.
    """
    reminder = (
        db.query(Reminder)
        .filter(Reminder.id == reminder_id, Reminder.family_id == member.family_id)
        .first()
    )
    if not reminder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hatırlatıcı bulunamadı.")

    if reminder_in.title is not None:
        reminder.title = reminder_in.title
    if reminder_in.description is not None:
        reminder.description = reminder_in.description
    if reminder_in.remind_at is not None:
        reminder.remind_at = reminder_in.remind_at
    if reminder_in.repeat_interval is not None:
        reminder.repeat_interval = reminder_in.repeat_interval
    if reminder_in.notify_before_minutes is not None:
        reminder.notify_before_minutes = reminder_in.notify_before_minutes
    if reminder_in.is_completed is not None:
        reminder.is_completed = reminder_in.is_completed

    db.commit()
    db.refresh(reminder)

    creator = db.query(User).filter(User.id == reminder.creator_id).first()
    return ReminderResponse(
        id=reminder.id,
        family_id=reminder.family_id,
        creator_id=reminder.creator_id,
        title=reminder.title,
        description=reminder.description,
        remind_at=reminder.remind_at,
        repeat_interval=reminder.repeat_interval,
        notify_before_minutes=reminder.notify_before_minutes,
        is_completed=reminder.is_completed,
        created_at=reminder.created_at,
        creator_name=creator.full_name if creator else "Aile Üyesi"
    )


@router.post("/{reminder_id}/snooze", response_model=ReminderResponse)
def snooze_reminder(
    reminder_id: str,
    minutes: int = 10,
    db: Session = Depends(get_db),
    member: FamilyMember = Depends(get_current_family_member)
):
    """
    Snoozes a reminder by specified minutes (defaults to 10 minutes).
    """
    from datetime import timedelta
    reminder = (
        db.query(Reminder)
        .filter(Reminder.id == reminder_id, Reminder.family_id == member.family_id)
        .first()
    )
    if not reminder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hatırlatıcı bulunamadı.")

    reminder.remind_at = reminder.remind_at + timedelta(minutes=minutes)
    reminder.is_completed = False
    db.commit()
    db.refresh(reminder)

    creator = db.query(User).filter(User.id == reminder.creator_id).first()
    return ReminderResponse(
        id=reminder.id,
        family_id=reminder.family_id,
        creator_id=reminder.creator_id,
        title=reminder.title,
        description=reminder.description,
        remind_at=reminder.remind_at,
        repeat_interval=reminder.repeat_interval,
        notify_before_minutes=reminder.notify_before_minutes,
        is_completed=reminder.is_completed,
        created_at=reminder.created_at,
        creator_name=creator.full_name if creator else "Aile Üyesi"
    )


@router.delete("/{reminder_id}")
def delete_reminder(
    reminder_id: str,
    db: Session = Depends(get_db),
    member: FamilyMember = Depends(get_current_family_member)
):
    """
    Deletes a reminder.
    """
    reminder = (
        db.query(Reminder)
        .filter(Reminder.id == reminder_id, Reminder.family_id == member.family_id)
        .first()
    )
    if not reminder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hatırlatıcı bulunamadı.")

    db.delete(reminder)
    db.commit()
    return {"message": "Hatırlatıcı silindi."}
