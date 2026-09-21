from typing import Literal

from pydantic import BaseModel, Field

FieldType = Literal["text", "number", "textarea", "select", "date", "file", "tableObject"]


class FormFieldValidationIn(BaseModel):
    min: float | None = None
    max: float | None = None
    regex: str | None = None


class FormFieldIn(BaseModel):
    name: str
    label: str
    type: FieldType
    required: bool = False
    options: list[str] = Field(default_factory=list)
    validation: FormFieldValidationIn | None = None


class FormConfigIn(BaseModel):
    request_type: str
    title: str
    fields: list[FormFieldIn] = Field(default_factory=list)


class FormConfigUpdateIn(BaseModel):
    title: str | None = None
    fields: list[FormFieldIn] | None = None
