from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.models.models import Note, User, FamilyMember
from backend.app.schemas.schemas import (
    NoteCreate,
    NoteUpdate,
    NoteResponse
)
from backend.app.api.deps import get_current_user, get_current_family_member

router = APIRouter()


@router.get("/", response_model=List[NoteResponse])
def get_notes(
    is_private: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member)
):
    """
    Returns notes. Public notes are visible to all family members.
    Private notes are visible ONLY to the author.
    """
    query = db.query(Note).filter(Note.family_id == member.family_id)

    # Privacy filter: User can only see public notes OR their own private notes
    query = query.filter(
        (Note.is_private == False) | (Note.author_id == current_user.id)
    )

    if is_private is not None:
        query = query.filter(Note.is_private == is_private)

    notes = query.order_by(Note.updated_at.desc()).all()

    results = []
    for note in notes:
        author = db.query(User).filter(User.id == note.author_id).first()
        results.append(
            NoteResponse(
                id=note.id,
                family_id=note.family_id,
                author_id=note.author_id,
                title=note.title,
                content=note.content,
                is_private=note.is_private,
                color=note.color,
                created_at=note.created_at,
                updated_at=note.updated_at,
                author_name=author.full_name if author else "Aile Üyesi"
            )
        )
    return results


@router.post("/", response_model=NoteResponse, status_code=status.HTTP_201_CREATED)
def create_note(
    note_in: NoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member)
):
    """
    Creates a new note (shared or private).
    """
    note = Note(
        family_id=member.family_id,
        author_id=current_user.id,
        title=note_in.title,
        content=note_in.content,
        is_private=note_in.is_private,
        color=note_in.color
    )
    db.add(note)
    db.commit()
    db.refresh(note)

    return NoteResponse(
        id=note.id,
        family_id=note.family_id,
        author_id=note.author_id,
        title=note.title,
        content=note.content,
        is_private=note.is_private,
        color=note.color,
        created_at=note.created_at,
        updated_at=note.updated_at,
        author_name=current_user.full_name
    )


@router.patch("/{note_id}", response_model=NoteResponse)
def update_note(
    note_id: str,
    note_in: NoteUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member)
):
    """
    Updates an existing note.
    """
    note = (
        db.query(Note)
        .filter(Note.id == note_id, Note.family_id == member.family_id)
        .first()
    )
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not bulunamadı.")

    # Only author can edit private notes
    if note.is_private and note.author_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bu nota erişim izniniz yok.")

    if note_in.title is not None:
        note.title = note_in.title
    if note_in.content is not None:
        note.content = note_in.content
    if note_in.is_private is not None:
        note.is_private = note_in.is_private
    if note_in.color is not None:
        note.color = note_in.color

    db.commit()
    db.refresh(note)

    author = db.query(User).filter(User.id == note.author_id).first()
    return NoteResponse(
        id=note.id,
        family_id=note.family_id,
        author_id=note.author_id,
        title=note.title,
        content=note.content,
        is_private=note.is_private,
        color=note.color,
        created_at=note.created_at,
        updated_at=note.updated_at,
        author_name=author.full_name if author else "Aile Üyesi"
    )


@router.delete("/{note_id}")
def delete_note(
    note_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member)
):
    """
    Deletes a note if author or family admin.
    """
    note = (
        db.query(Note)
        .filter(Note.id == note_id, Note.family_id == member.family_id)
        .first()
    )
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not bulunamadı.")

    if note.author_id != current_user.id and member.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bu notu silme yetkiniz yok.")

    db.delete(note)
    db.commit()
    return {"message": "Not silindi."}
