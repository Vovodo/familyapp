from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.models.models import TaskItem, User, FamilyMember
from backend.app.api.deps import get_current_user, get_current_family_member
from loguru import logger

router = APIRouter()


class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    priority: str = "normal"  # 'normal' or 'urgent'
    assigned_to: Optional[str] = None
    due_date: Optional[datetime] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    assigned_to: Optional[str] = None
    due_date: Optional[datetime] = None
    is_completed: Optional[bool] = None


class TaskResponse(BaseModel):
    id: str
    family_id: str
    created_by: str
    assigned_to: Optional[str] = None
    title: str
    description: Optional[str] = None
    priority: str
    is_completed: bool
    completed_at: Optional[datetime] = None
    completed_by: Optional[str] = None
    due_date: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    creator_name: Optional[str] = None
    assignee_name: Optional[str] = None
    completer_name: Optional[str] = None

    class Config:
        from_attributes = True


def _enrich_task(task: TaskItem, db: Session) -> dict:
    creator = db.query(User).filter(User.id == task.created_by).first() if task.created_by else None
    assignee = db.query(User).filter(User.id == task.assigned_to).first() if task.assigned_to else None
    completer = db.query(User).filter(User.id == task.completed_by).first() if task.completed_by else None

    return {
        "id": task.id,
        "family_id": task.family_id,
        "created_by": task.created_by,
        "assigned_to": task.assigned_to,
        "title": task.title,
        "description": task.description,
        "priority": task.priority or "normal",
        "is_completed": task.is_completed,
        "completed_at": task.completed_at,
        "completed_by": task.completed_by,
        "due_date": task.due_date,
        "created_at": task.created_at,
        "updated_at": task.updated_at,
        "creator_name": creator.full_name.split()[0] if creator else None,
        "assignee_name": assignee.full_name.split()[0] if assignee else None,
        "completer_name": completer.full_name.split()[0] if completer else None,
    }


@router.get("/", response_model=List[TaskResponse])
def list_tasks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member)
):
    """
    Returns all tasks for the family sorted by active first, priority, then date.
    """
    tasks = db.query(TaskItem).filter(
        TaskItem.family_id == member.family_id
    ).order_by(
        TaskItem.is_completed.asc(),
        TaskItem.priority.desc(),
        TaskItem.created_at.desc()
    ).all()

    return [_enrich_task(t, db) for t in tasks]


@router.post("/", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
def create_task(
    payload: TaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member)
):
    """
    Creates a new family task / to-do item.
    """
    task = TaskItem(
        family_id=member.family_id,
        created_by=current_user.id,
        assigned_to=payload.assigned_to,
        title=payload.title.strip(),
        description=payload.description.strip() if payload.description else None,
        priority=payload.priority if payload.priority in ["normal", "urgent"] else "normal",
        due_date=payload.due_date,
        is_completed=False
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    logger.info(f"Task created: '{task.title}' by {current_user.full_name} in family {member.family_id}")
    return _enrich_task(task, db)


@router.patch("/{task_id}/toggle", response_model=TaskResponse)
def toggle_task(
    task_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member)
):
    """
    Toggles completion state of a task with completed_at and completed_by timestamp.
    """
    task = db.query(TaskItem).filter(
        TaskItem.id == task_id,
        TaskItem.family_id == member.family_id
    ).first()

    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Görev bulunamadı.")

    task.is_completed = not task.is_completed
    if task.is_completed:
        task.completed_at = datetime.now(timezone.utc)
        task.completed_by = current_user.id
    else:
        task.completed_at = None
        task.completed_by = None

    db.commit()
    db.refresh(task)
    return _enrich_task(task, db)


@router.put("/{task_id}", response_model=TaskResponse)
def update_task(
    task_id: str,
    payload: TaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member)
):
    """
    Updates task properties.
    """
    task = db.query(TaskItem).filter(
        TaskItem.id == task_id,
        TaskItem.family_id == member.family_id
    ).first()

    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Görev bulunamadı.")

    if payload.title is not None:
        task.title = payload.title.strip()
    if payload.description is not None:
        task.description = payload.description.strip() or None
    if payload.priority is not None:
        task.priority = payload.priority
    if payload.assigned_to is not None:
        task.assigned_to = payload.assigned_to or None
    if payload.due_date is not None:
        task.due_date = payload.due_date
    if payload.is_completed is not None:
        task.is_completed = payload.is_completed
        if payload.is_completed:
            task.completed_at = datetime.now(timezone.utc)
            task.completed_by = current_user.id
        else:
            task.completed_at = None
            task.completed_by = None

    db.commit()
    db.refresh(task)
    return _enrich_task(task, db)


@router.delete("/{task_id}", status_code=status.HTTP_200_OK)
def delete_task(
    task_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member)
):
    """
    Deletes a task.
    """
    task = db.query(TaskItem).filter(
        TaskItem.id == task_id,
        TaskItem.family_id == member.family_id
    ).first()

    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Görev bulunamadı.")

    db.delete(task)
    db.commit()
    return {"status": "success", "message": "Görev başarıyla silindi."}
