#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MAX Chat OCR Postprocessor

Локально обогащает экспорт MAX Chat Local Exporter:
- читает messages.json / attachments_manifest.csv;
- запускает локальный Tesseract OCR по изображениям;
- сохраняет связку сообщение -> reply -> вложение -> OCR;
- строит версии анкет и помечает последнюю как CURRENT;
- формирует messages_ocr.txt, messages_ocr.json, index_ocr.html, ocr_summary.csv, cases_summary.csv.

Никаких сетевых запросов не выполняет.
"""

from __future__ import annotations

import argparse
import csv
import html
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from dataclasses import dataclass, asdict, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

try:
    from PIL import Image, ImageOps, ImageFilter
except Exception:  # pragma: no cover
    Image = None
    ImageOps = None
    ImageFilter = None

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}
DEFAULT_LANG = "rus+eng"
VERSION = "0.3.1"


@dataclass
class AttachmentOCR:
    attachment_index: int
    original_path: str
    file_name: str
    ocr_text: str
    phones: List[str]
    names: List[str]
    status: str
    error: str = ""
    raw_ocr_path: str = ""
    case_key: str = ""
    version_index: int = 0
    version_total: int = 0
    version_status: str = "UNKNOWN"
    superseded_by_message_index: int = 0
    superseded_by_attachment_path: str = ""
    version_reason: str = ""
    structured: Dict[str, Any] = field(default_factory=dict)


@dataclass
class MessageOCR:
    message_index: int
    message_id: str
    author: str
    datetime: str
    message_url: str
    message_url_source: str
    max_chat_url: str
    local_export_anchor: str
    text: str
    attachment_paths: List[str]
    attachment_ocr: List[AttachmentOCR]
    reply_to_message_index: int = 0
    reply_to_message_id: str = ""
    reply_text: str = ""
    text_full: str = ""
    case_key: str = ""


def log(msg: str) -> None:
    print(msg, flush=True)


def safe_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def first_present(d: Dict[str, Any], keys: Iterable[str], default: Any = "") -> Any:
    for key in keys:
        if key in d and d[key] not in (None, ""):
            return d[key]
    return default


def unpack_if_needed(input_path: Path, work_dir: Path) -> Path:
    if input_path.is_file() and input_path.suffix.lower() == ".zip":
        extract_dir = work_dir / "extracted_export"
        extract_dir.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(input_path, "r") as zf:
            zf.extractall(extract_dir)
        # If ZIP contains a single root folder, use it.
        children = [p for p in extract_dir.iterdir() if not p.name.startswith("__MACOSX")]
        if len(children) == 1 and children[0].is_dir():
            return children[0]
        return extract_dir
    if input_path.is_dir():
        return input_path
    raise FileNotFoundError(f"Не найден ZIP или папка экспорта: {input_path}")


def find_export_root(root: Path) -> Path:
    if (root / "messages.json").exists():
        return root
    matches = list(root.rglob("messages.json"))
    if not matches:
        raise FileNotFoundError("Не найден messages.json внутри экспорта")
    # Prefer the shortest path, usually export root.
    return sorted(matches, key=lambda p: len(p.parts))[0].parent


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def normalize_attachment_path(item: Any) -> str:
    if isinstance(item, str):
        return item.strip()
    if isinstance(item, dict):
        value = first_present(
            item,
            [
                "path",
                "relativePath",
                "relative_path",
                "localPath",
                "local_path",
                "file",
                "fileName",
                "filename",
                "name",
            ],
            "",
        )
        return safe_text(value)
    return ""


def attachment_paths_from_manifest(export_root: Path) -> Dict[int, List[str]]:
    manifest = export_root / "attachments_manifest.csv"
    result: Dict[int, List[str]] = {}
    if not manifest.exists():
        return result

    with manifest.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            raw_index = first_present(row, ["message_index", "message", "index", "msg_index"], "")
            path = first_present(row, ["attachment_path", "path", "file_path", "relative_path"], "")
            try:
                idx = int(str(raw_index).strip().lstrip("#"))
            except Exception:
                continue
            if path:
                result.setdefault(idx, []).append(str(path).strip())
    return result


def normalize_messages(export_root: Path) -> List[Dict[str, Any]]:
    data = load_json(export_root / "messages.json")
    if isinstance(data, dict):
        raw_messages = data.get("messages") or data.get("items") or data.get("data") or []
    elif isinstance(data, list):
        raw_messages = data
    else:
        raw_messages = []

    manifest_map = attachment_paths_from_manifest(export_root)
    normalized: List[Dict[str, Any]] = []

    for pos, msg in enumerate(raw_messages, start=1):
        if not isinstance(msg, dict):
            msg = {"text": safe_text(msg)}

        raw_index = first_present(msg, ["message_index", "index", "ordinal", "number", "n"], pos)
        try:
            message_index = int(str(raw_index).strip().lstrip("#"))
        except Exception:
            message_index = pos

        raw_attachments = first_present(msg, ["attachments", "attachment_paths", "files", "media"], [])
        if isinstance(raw_attachments, str):
            attachment_paths = [p.strip() for p in re.split(r"[|;\n]", raw_attachments) if p.strip()]
        elif isinstance(raw_attachments, list):
            attachment_paths = [p for p in (normalize_attachment_path(x) for x in raw_attachments) if p]
        else:
            attachment_paths = []

        if not attachment_paths and message_index in manifest_map:
            attachment_paths = manifest_map[message_index]

        reply = msg.get("reply") if isinstance(msg.get("reply"), dict) else {}
        reply_to_raw = first_present(reply, ["targetMessageNumber", "target_message_number", "reply_to_message_index"], 0)
        try:
            reply_to_idx = int(str(reply_to_raw or "0").strip().lstrip("#"))
        except Exception:
            reply_to_idx = 0

        normalized.append(
            {
                "message_index": message_index,
                "message_id": safe_text(first_present(msg, ["message_id", "id", "uid"], f"msg_{message_index:04d}")),
                "author": safe_text(first_present(msg, ["author", "sender", "from", "name"], "")),
                "datetime": safe_text(first_present(msg, ["datetime", "date", "time", "timestamp"], "")),
                "message_url": safe_text(first_present(msg, ["messageUrl", "message_url", "max_message_link", "maxMessageLink", "permalink", "link", "url"], "")),
                "message_url_source": safe_text(first_present(msg, ["messageUrlSource", "message_url_source", "url_source", "link_source"], "")),
                "max_chat_url": safe_text(first_present(msg, ["maxChatUrl", "max_chat_url", "chatUrl", "chat_url", "sourceUrl", "source_url"], "")),
                "local_export_anchor": safe_text(first_present(msg, ["localExportAnchor", "local_export_anchor", "anchor"], "")),
                "text": safe_text(first_present(msg, ["bodyText", "body", "message", "content", "textContent", "text"], "")),
                "text_full": safe_text(first_present(msg, ["text", "textFull", "fullText"], "")),
                "attachment_paths": attachment_paths,
                "reply_to_message_index": reply_to_idx,
                "reply_to_message_id": safe_text(first_present(reply, ["targetMessageId", "target_message_id"], "")),
                "reply_text": safe_text(first_present(reply, ["text", "quote", "quotedText"], "")),
            }
        )

    return normalized


def resolve_attachment(export_root: Path, rel_path: str) -> Optional[Path]:
    p = Path(rel_path)
    candidates = []
    if p.is_absolute():
        candidates.append(p)
    candidates.extend(
        [
            export_root / rel_path,
            export_root / p.name,
            export_root / "attachments" / rel_path,
            export_root / "attachments" / p.name,
        ]
    )
    for candidate in candidates:
        if candidate.exists() and candidate.is_file():
            return candidate

    # Fallback: search by filename in attachments folder.
    attachments_dir = export_root / "attachments"
    if attachments_dir.exists():
        matches = list(attachments_dir.rglob(p.name))
        if matches:
            return matches[0]
    return None


def ensure_tesseract_available(tesseract_cmd: str) -> None:
    try:
        subprocess.run([tesseract_cmd, "--version"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False, text=True, encoding="utf-8", errors="replace")
    except FileNotFoundError as exc:
        raise RuntimeError(
            "Tesseract не найден. Установи Tesseract OCR и убедись, что команда tesseract доступна в PATH."
        ) from exc


def preprocess_image(src: Path, dst: Path, upscale: int = 2) -> Path:
    if Image is None:
        return src
    try:
        with Image.open(src) as im:
            im = ImageOps.exif_transpose(im)
            im = im.convert("L")
            w, h = im.size
            if upscale > 1 and max(w, h) < 2500:
                im = im.resize((w * upscale, h * upscale))
            im = ImageOps.autocontrast(im)
            # Mild sharpening helps small phone screenshots, but avoid aggressive binarization.
            im = im.filter(ImageFilter.SHARPEN)
            im.save(dst)
        return dst
    except Exception:
        return src


def run_tesseract(
    image_path: Path,
    tesseract_cmd: str,
    lang: str,
    psm: int,
    timeout: int,
) -> str:
    cmd = [
        tesseract_cmd,
        str(image_path),
        "stdout",
        "-l",
        lang,
        "--oem",
        "1",
        "--psm",
        str(psm),
        "-c",
        "preserve_interword_spaces=1",
    ]
    # В Windows Python по умолчанию может пытаться читать вывод процесса в cp1251.
    # Tesseract часто отдает stdout/stderr в UTF-8, из-за чего возникает UnicodeDecodeError
    # в subprocess._readerthread. Явно читаем как UTF-8 и заменяем битые байты.
    proc = subprocess.run(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError((proc.stderr or proc.stdout or "Tesseract завершился с ошибкой").strip())
    return proc.stdout.strip()


def normalize_phone(raw: str) -> str:
    digits = re.sub(r"\D", "", raw)
    if len(digits) == 11 and digits[0] in "78":
        return "7" + digits[1:]
    if len(digits) == 10:
        return "7" + digits
    return digits


def extract_phones(text: str) -> List[str]:
    # Ищем телефоны построчно, чтобы случайно не склеивать ИНН/паспорт с номером строки.
    # Поддерживает форматы: 89236860134, 89 236 860 134, +7 (3812) 29-00-59.
    phones: List[str] = []
    for line in (text or "").splitlines():
        lower = line.lower().replace("ё", "е")
        skip_10_digit_context = any(x in lower for x in ["паспорт", "увд", "инн", "hhh", "работодателя"])
        for match in re.findall(r"\+?\d[\d\s\-\(\)]{8,}\d", line):
            digits = re.sub(r"\D", "", match)
            if len(digits) == 11 and digits[0] in "78":
                normalized = normalize_phone(match)
            elif len(digits) == 10 and ("+7" in match or "тел" in lower) and not skip_10_digit_context:
                normalized = normalize_phone(match)
            else:
                continue
            if normalized and normalized not in phones:
                phones.append(normalized)
    return phones


def clean_name(value: str) -> str:
    value = re.sub(r"[^А-Яа-яЁёA-Za-z\-\s]", " ", value)
    value = re.sub(r"\s+", " ", value).strip()
    return value


def normalize_name_key(value: str) -> str:
    cleaned = clean_name(value).lower().replace("ё", "е")
    return re.sub(r"\s+", " ", cleaned).strip()


def normalize_case_key(names: List[str], phones: List[str], reply_case_key: str = "") -> Tuple[str, str]:
    # Телефон обычно надежнее OCR-ФИО: одна цифра может ошибиться, но если телефон есть, он хорошо связывает версии.
    good_phones = [p for p in phones if 10 <= len(re.sub(r"\D", "", p)) <= 11]
    if good_phones:
        return "phone:" + sorted(good_phones)[0], "phone"
    good_names = [normalize_name_key(n) for n in names if len(normalize_name_key(n).split()) >= 2]
    if good_names:
        return "name:" + good_names[0], "name"
    if reply_case_key:
        return reply_case_key, "reply_chain"
    return "", "not_enough_data"


def merge_unique(items: Iterable[str]) -> List[str]:
    out: List[str] = []
    for item in items:
        val = safe_text(item)
        if val and val not in out:
            out.append(val)
    return out


def extract_names(text: str) -> List[str]:
    candidates: List[str] = []

    # Explicit labels first.
    label_patterns = [
        r"(?:ФИО|Ф\.И\.О\.|Клиент|Заявитель|Должник)\s*[:\-]?\s*([А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+)?)",
        r"(?:Фамилия\s+Имя\s+Отчество)\s*[:\-]?\s*([А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+)?)",
    ]
    for pat in label_patterns:
        for m in re.findall(pat, text, flags=re.IGNORECASE):
            val = clean_name(m)
            if len(val.split()) >= 2:
                candidates.append(val)

    # Generic 2-3 Cyrillic words line. Keep conservative to reduce false positives.
    for line in text.splitlines():
        line_clean = clean_name(line)
        parts = line_clean.split()
        if 2 <= len(parts) <= 3 and all(re.match(r"^[А-ЯЁ][а-яё]{2,}$", p) for p in parts):
            candidates.append(line_clean)

    # Short form from chat text: «Петров В.А.» / «Петров В А».
    for m in re.findall(r"\b([А-ЯЁ][а-яё]{2,})\s+([А-ЯЁ])\.?\s*([А-ЯЁ])\.?\b", text):
        candidates.append(f"{m[0]} {m[1]} {m[2]}")

    deduped: List[str] = []
    for c in candidates:
        if c not in deduped:
            deduped.append(c)
    return deduped[:5]


def ocr_attachment(
    export_root: Path,
    rel_path: str,
    message_index: int,
    attachment_index: int,
    out_dir: Path,
    tesseract_cmd: str,
    lang: str,
    psm: int,
    timeout: int,
) -> AttachmentOCR:
    file_name = Path(rel_path).name
    src = resolve_attachment(export_root, rel_path)
    if not src:
        return AttachmentOCR(attachment_index, rel_path, file_name, "", [], [], "missing", "Файл вложения не найден")
    if src.suffix.lower() not in IMAGE_EXTENSIONS:
        return AttachmentOCR(attachment_index, rel_path, file_name, "", [], [], "skipped", "Не изображение")

    msg_dir = out_dir / "ocr_raw" / f"msg_{message_index:04d}"
    msg_dir.mkdir(parents=True, exist_ok=True)
    raw_txt_path = msg_dir / f"att_{attachment_index:02d}_{src.stem}.txt"

    with tempfile.TemporaryDirectory(prefix="max_ocr_") as tmp:
        preprocessed = Path(tmp) / f"preprocessed_{src.stem}.png"
        ocr_input = preprocess_image(src, preprocessed)
        try:
            text = run_tesseract(ocr_input, tesseract_cmd, lang, psm, timeout)
            # If psm=6 finds almost nothing, try sparse text mode.
            if len(text.strip()) < 8 and psm != 11:
                text2 = run_tesseract(ocr_input, tesseract_cmd, lang, 11, timeout)
                if len(text2.strip()) > len(text.strip()):
                    text = text2
            raw_txt_path.write_text(text, encoding="utf-8")
            return AttachmentOCR(
                attachment_index=attachment_index,
                original_path=rel_path,
                file_name=file_name,
                ocr_text=text,
                phones=extract_phones(text),
                names=extract_names(text),
                status="ok",
                raw_ocr_path=str(raw_txt_path.relative_to(out_dir)),
                structured=extract_structured_form(text),
            )
        except Exception as exc:
            err = str(exc)
            raw_txt_path.write_text(f"OCR_ERROR: {err}\n", encoding="utf-8")
            return AttachmentOCR(attachment_index, rel_path, file_name, "", [], [], "failed", err, str(raw_txt_path.relative_to(out_dir)))



# -----------------------------
# Структурирование анкет
# -----------------------------

def strip_row_number(line: str) -> str:
    line = line.replace("|", " ").strip()
    # В OCR Excel-таблиц часто первая колонка превращается в номер строки.
    # Важно: НЕ схлопываем множественные пробелы — они помогают отделять левую колонку от значения.
    line = re.sub(r"^\s*\d{1,3}\s+", "", line)
    return line.strip()


def compact_spaces(value: str) -> str:
    value = safe_text(value)
    value = value.replace("—", "-").replace("–", "-")
    value = re.sub(r"[\u00a0\t]+", " ", value)
    value = re.sub(r"\s+", " ", value).strip(" .;:,|=")
    return value


def split_ocr_label_value(raw_line: str) -> Tuple[str, str]:
    """Best-effort split of OCR table row into left label and right value."""
    line = raw_line.replace("|", " ").rstrip()
    line = re.sub(r"^\s*\d{1,3}\s+", "", line)
    parts = [compact_spaces(p) for p in re.split(r"\s{2,}", line) if compact_spaces(p)]
    if len(parts) >= 2:
        return parts[0], parts[-1]
    return compact_spaces(line), ""


def clean_money(value: str) -> str:
    value = compact_spaces(value)
    m = re.search(r"\d[\d\s]{2,}", value)
    return re.sub(r"\s+", "", m.group(0)) if m else value


def money_int(value: str) -> str:
    digits = re.sub(r"\D", "", value or "")
    return digits


def normalize_date(value: str) -> str:
    m = re.search(r"\b(\d{1,2})[\.\-/](\d{1,2})[\.\-/](\d{2,4})\b", value or "")
    if not m:
        return ""
    d, mo, y = m.groups()
    if len(y) == 2:
        y = "19" + y if int(y) > 30 else "20" + y
    return f"{int(y):04d}-{int(mo):02d}-{int(d):02d}"


def looks_like_label(value: str) -> bool:
    v = normalize_name_key(value)
    label_words = [
        "стоимость", "взнос", "срок", "марка", "год", "платеж", "фио", "паспорт", "адрес",
        "телефон", "образование", "организации", "работодателя", "отраслевая", "должность",
        "стаж", "доход", "собственность", "семейное", "количество", "место работы",
    ]
    return any(w in v for w in label_words)


def ocr_lines(text: str) -> List[str]:
    return [strip_row_number(x) for x in (text or "").splitlines() if strip_row_number(x)]


def find_line_value(lines: List[str], *needles: str) -> str:
    needles_norm = [n.lower().replace("ё", "е") for n in needles]
    for line in lines:
        norm = line.lower().replace("ё", "е")
        if all(n in norm for n in needles_norm):
            label, value = split_ocr_label_value(line)
            # Если Tesseract склеил label+value одним пробелом, пробуем откусить хвост после ключевой фразы.
            if value:
                return compact_spaces(value)
            return compact_spaces(re.sub(".*" + re.escape(needles[-1]) + r"\s*", "", line, flags=re.IGNORECASE))
    return ""


def find_first_phone_near(lines: List[str], *needles: str) -> str:
    needles_norm = [n.lower().replace("ё", "е") for n in needles]
    for i, line in enumerate(lines):
        norm = line.lower().replace("ё", "е")
        if all(n in norm for n in needles_norm):
            window = "\n".join(lines[max(0, i-1): min(len(lines), i+2)])
            phones = extract_phones(window)
            if phones:
                return phones[0]
    return ""


def extract_passport_data(lines: List[str], text: str) -> Dict[str, str]:
    passport_line = ""
    for line in lines:
        if re.search(r"\b\d{4}\s*\d{6}\b", line):
            passport_line = compact_spaces(line)
            break
    series_number = ""
    issued_by = ""
    if passport_line:
        m = re.search(r"\b(\d{4})\s*(\d{6})\b\s*(.*)$", passport_line)
        if m:
            series_number = f"{m.group(1)} {m.group(2)}"
            issued_by = compact_spaces(m.group(3))
    return {"passport_series_number": series_number, "passport_issued_by": issued_by, "passport_raw": passport_line}


def extract_borrower(lines: List[str]) -> Dict[str, str]:
    raw = find_line_value(lines, "ФИО", "заем") or find_line_value(lines, "ФИО")
    # Убираем случайный мусор/ярлыки и дату.
    dob_iso = normalize_date(raw)
    dob_match = re.search(r"\b\d{1,2}[\.\-/]\d{1,2}[\.\-/]\d{2,4}\b", raw)
    name = raw[:dob_match.start()].strip() if dob_match else raw
    name = clean_name(name)
    # Если find_line_value не сработал, ищем ФИО + дату в любой строке.
    if not name or len(name.split()) < 2:
        for line in lines:
            m = re.search(r"([А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+)\s+(\d{1,2}[\.\-/]\d{1,2}[\.\-/]\d{2,4})", line)
            if m:
                name = clean_name(m.group(1))
                dob_iso = normalize_date(m.group(2))
                raw = line
                break
    return {"borrower_full_name": name, "borrower_birth_date": dob_iso, "borrower_raw": compact_spaces(raw)}


def extract_contact_person(lines: List[str]) -> Dict[str, str]:
    raw = find_line_value(lines, "ФИО", "тел")
    if not raw:
        # В реальных анкетах это часто выглядит как: 89914310553 Анастасия
        for line in lines:
            if extract_phones(line) and re.search(r"[А-ЯЁ][а-яё]{2,}", line):
                raw = line
                break
    phones = extract_phones(raw)
    phone = phones[0] if phones else ""
    name_part = raw
    for ph in re.findall(r"(?:\+?7|8)?[\s\-\(\)]*\d{3}[\s\-\)]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}", raw):
        name_part = name_part.replace(ph, " ")
    name = clean_name(name_part)
    # Не называем полем то, что похоже на ярлык.
    if looks_like_label(name):
        name = ""
    return {"contact_person_name": name, "contact_person_phone": phone, "contact_person_raw": compact_spaces(raw)}


def extract_industry(lines: List[str]) -> str:
    for i, line in enumerate(lines):
        if "отрослевая" in line.lower().replace("ё", "е") or "отраслевая" in line.lower().replace("ё", "е"):
            _, value = split_ocr_label_value(line)
            prev = lines[i-1] if i > 0 else ""
            pieces = []
            if prev and not looks_like_label(prev) and len(prev) > 10:
                pieces.append(prev)
            if value:
                pieces.append(value)
            return compact_spaces(" ".join(pieces))
    return ""


def extract_employer(lines: List[str]) -> Dict[str, str]:
    employer_name = find_line_value(lines, "организации")
    if not employer_name:
        for line in lines:
            if re.search(r"[О0]{2,3}\s*[\"'«][^\"'»]+[\"'»]", line, flags=re.IGNORECASE):
                employer_name = compact_spaces(line)
                break
    employer_name = re.sub(r"\b000\b", "ООО", employer_name)  # частая OCR-ошибка: ООО -> 000
    inn = ""
    joined = "\n".join(lines)
    m = re.search(r"\b\d{10}\b|\b\d{12}\b", joined)
    if m:
        inn = m.group(0)
    return {"employer_name": employer_name, "employer_inn": inn}


def extract_structured_form(text: str) -> Dict[str, Any]:
    """Extract normalized fields from common Russian credit-application screenshots.

    Это не замена OCR и не юридическая истина. Это слой для поиска/матчинга:
    мы сохраняем и сырый OCR, и нормализованные поля.
    """
    lines = ocr_lines(text)
    joined = "\n".join(lines)

    borrower = extract_borrower(lines)
    passport = extract_passport_data(lines, text)
    contact = extract_contact_person(lines)
    employer = extract_employer(lines)

    mobile_phone = find_first_phone_near(lines, "мобиль", "телефон")
    work_phone = find_first_phone_near(lines, "рабоч", "телефон")

    raw_car_price = find_line_value(lines, "Стоимость", "Авто")
    raw_down_payment = find_line_value(lines, "Первоначальный", "взнос")
    raw_payment = find_line_value(lines, "Желаемый", "платеж")
    raw_income = find_line_value(lines, "Общий", "доход")

    all_phones = merge_unique(extract_phones(joined))
    if mobile_phone:
        all_phones = merge_unique([mobile_phone, *all_phones])
    if work_phone:
        all_phones = merge_unique([work_phone, *all_phones])
    if contact.get("contact_person_phone"):
        all_phones = merge_unique([contact["contact_person_phone"], *all_phones])

    fields = {
        "loan_application_title": "Заявка на получение кредита" if "заявка" in joined.lower() and "кредит" in joined.lower() else "",
        "car_price": clean_money(raw_car_price),
        "down_payment": clean_money(raw_down_payment),
        "loan_term": find_line_value(lines, "Срок", "кредита"),
        "car_make_model": find_line_value(lines, "Марка", "модель"),
        "car_year": re.sub(r"\D", "", find_line_value(lines, "Год", "Авто"))[:4],
        "desired_monthly_payment": clean_money(raw_payment),
        **borrower,
        "maiden_name_change": find_line_value(lines, "Девичья"),
        **passport,
        "registration_address": find_line_value(lines, "Адрес", "прописке"),
        "actual_residence_address": find_line_value(lines, "фактического") or find_line_value(lines, "проживания"),
        "mobile_phone": mobile_phone,
        **contact,
        "education": find_line_value(lines, "Образование"),
        **employer,
        "work_phone": work_phone,
        "industry": extract_industry(lines),
        "work_address": find_line_value(lines, "Адрес", "работы"),
        "position": find_line_value(lines, "Занимаемая", "должность"),
        "work_experience": find_line_value(lines, "общий", "трудовой") or find_line_value(lines, "Стаж"),
        "monthly_income": clean_money(raw_income),
        "property": find_line_value(lines, "Собственность") or find_line_value(lines, "квартира"),
        "family_status": find_line_value(lines, "Семейное", "положение"),
        "dependents_count": find_line_value(lines, "ижд"),
    }

    normalized = {
        "borrower_full_name_key": normalize_name_key(fields.get("borrower_full_name", "")),
        "borrower_birth_date_iso": fields.get("borrower_birth_date", ""),
        "mobile_phone_norm": normalize_phone(fields.get("mobile_phone", "")),
        "contact_person_phone_norm": normalize_phone(fields.get("contact_person_phone", "")),
        "work_phone_norm": normalize_phone(fields.get("work_phone", "")),
        "passport_series_number_norm": re.sub(r"\D", "", fields.get("passport_series_number", "")),
        "employer_inn_norm": re.sub(r"\D", "", fields.get("employer_inn", "")),
        "car_price_num": money_int(fields.get("car_price", "")),
        "down_payment_num": money_int(fields.get("down_payment", "")),
        "desired_monthly_payment_num": money_int(fields.get("desired_monthly_payment", "")),
        "monthly_income_num": money_int(fields.get("monthly_income", "")),
        "all_phones_norm": all_phones,
    }

    # Для матчинга лучше иметь несколько ключей, а не один. Телефон, ФИО+ДР и паспорт — разные уровни надежности.
    match_keys = []
    if normalized["mobile_phone_norm"]:
        match_keys.append("phone:" + normalized["mobile_phone_norm"])
    if normalized["passport_series_number_norm"]:
        match_keys.append("passport:" + normalized["passport_series_number_norm"])
    if normalized["borrower_full_name_key"] and normalized["borrower_birth_date_iso"]:
        match_keys.append("fio_dob:" + normalized["borrower_full_name_key"] + "|" + normalized["borrower_birth_date_iso"])
    elif normalized["borrower_full_name_key"]:
        match_keys.append("fio:" + normalized["borrower_full_name_key"])

    filled = sum(1 for v in fields.values() if safe_text(v))
    return {
        "type": "credit_application",
        "fields": fields,
        "normalized": normalized,
        "match_keys": match_keys,
        "quality": {
            "filled_fields": filled,
            "total_fields": len(fields),
            "needs_review": filled < 8 or not match_keys,
        },
    }


def markdown_table(rows: List[Tuple[str, str]]) -> str:
    out = ["| Поле | Значение |", "|---|---|"]
    for k, v in rows:
        val = safe_text(v).replace("|", "\\|")
        out.append(f"| {k} | {val or '—'} |")
    return "\n".join(out)


def write_form_markdown(out_dir: Path, message: "MessageOCR", attachment: "AttachmentOCR") -> str:
    form = attachment.structured or {}
    fields = form.get("fields", {}) if isinstance(form, dict) else {}
    normalized = form.get("normalized", {}) if isinstance(form, dict) else {}
    match_keys = form.get("match_keys", []) if isinstance(form, dict) else []

    forms_dir = out_dir / "forms_md"
    forms_dir.mkdir(parents=True, exist_ok=True)
    stem = Path(attachment.original_path).stem or f"att_{attachment.attachment_index:02d}"
    md_name = f"msg_{message.message_index:04d}_att_{attachment.attachment_index:02d}_{stem}.md"
    md_path = forms_dir / md_name

    main_rows = [
        ("ФИО заемщика", fields.get("borrower_full_name", "")),
        ("Дата рождения", fields.get("borrower_birth_date", "")),
        ("Мобильный телефон", fields.get("mobile_phone", "")),
        ("Паспорт", fields.get("passport_series_number", "")),
        ("Кем выдан паспорт", fields.get("passport_issued_by", "")),
        ("Адрес прописки", fields.get("registration_address", "")),
        ("Факт. адрес", fields.get("actual_residence_address", "")),
        ("Контактное лицо", fields.get("contact_person_name", "")),
        ("Телефон контактного лица", fields.get("contact_person_phone", "")),
    ]
    credit_rows = [
        ("Стоимость авто", fields.get("car_price", "")),
        ("Первоначальный взнос", fields.get("down_payment", "")),
        ("Срок кредита", fields.get("loan_term", "")),
        ("Марка/модель авто", fields.get("car_make_model", "")),
        ("Год авто", fields.get("car_year", "")),
        ("Желаемый платеж", fields.get("desired_monthly_payment", "")),
    ]
    work_rows = [
        ("Образование", fields.get("education", "")),
        ("Работодатель", fields.get("employer_name", "")),
        ("ИНН работодателя", fields.get("employer_inn", "")),
        ("Рабочий телефон", fields.get("work_phone", "")),
        ("Отрасль", fields.get("industry", "")),
        ("Адрес работы", fields.get("work_address", "")),
        ("Должность", fields.get("position", "")),
        ("Стаж", fields.get("work_experience", "")),
        ("Доход в месяц", fields.get("monthly_income", "")),
        ("Собственность", fields.get("property", "")),
    ]

    content = []
    content.append(f"# Анкета: сообщение #{message.message_index}, вложение {attachment.attachment_index}")
    content.append("")
    content.append("## Связь с чатом")
    content.append(f"- Сообщение: #{message.message_index}")
    if message.message_url:
        content.append(f"- Ссылка MAX: {message.message_url}")
    elif message.max_chat_url:
        content.append(f"- Ссылка на чат MAX: {message.max_chat_url}")
    if message.datetime:
        content.append(f"- Дата/время: {message.datetime}")
    if message.author:
        content.append(f"- Автор: {message.author}")
    if message.reply_to_message_index:
        content.append(f"- Reply на сообщение: #{message.reply_to_message_index}")
    if message.reply_text:
        content.append(f"- Цитата reply: {message.reply_text}")
    content.append(f"- Вложение: `{attachment.original_path}`")
    if attachment.case_key:
        content.append(f"- Case key: `{attachment.case_key}`")
        content.append(f"- Версия: {attachment.version_index}/{attachment.version_total} — **{attachment.version_status}**")
    if match_keys:
        content.append("- Ключи матчинга: " + ", ".join(f"`{x}`" for x in match_keys))
    content.append("")
    content.append("## Текст сообщения")
    content.append(message.text or "[без текста]")
    content.append("")
    content.append("## Клиент / паспорт / контакты")
    content.append(markdown_table(main_rows))
    content.append("")
    content.append("## Кредит / авто")
    content.append(markdown_table(credit_rows))
    content.append("")
    content.append("## Работа / доход")
    content.append(markdown_table(work_rows))
    content.append("")
    content.append("## Нормализованные значения для матчинга")
    content.append("```json")
    content.append(json.dumps(normalized, ensure_ascii=False, indent=2))
    content.append("```")
    content.append("")
    content.append("## Сырой OCR")
    content.append("```text")
    content.append(attachment.ocr_text or "")
    content.append("```")
    md_path.write_text("\n".join(content), encoding="utf-8")
    return str(md_path.relative_to(out_dir))


def assign_form_versions(messages: List[MessageOCR]) -> Dict[str, Dict[str, Any]]:
    """Mark questionnaire/form image versions. Last image in chat order wins per case_key."""
    by_index = {m.message_index: m for m in messages}
    message_case_keys: Dict[int, str] = {}

    for m in messages:
        reply_key = message_case_keys.get(m.reply_to_message_index, "")
        text_names = extract_names("\n".join([m.text or "", m.reply_text or ""]))
        text_phones = extract_phones("\n".join([m.text or "", m.reply_text or ""]))
        msg_key, msg_reason = normalize_case_key(text_names, text_phones, reply_key)

        for a in m.attachment_ocr:
            combined_names = merge_unique([*a.names, *text_names])
            combined_phones = merge_unique([*a.phones, *text_phones])
            key, reason = normalize_case_key(combined_names, combined_phones, msg_key or reply_key)
            a.case_key = key
            a.version_reason = reason
            if key and not msg_key:
                msg_key = key
                msg_reason = reason
        m.case_key = msg_key
        if msg_key:
            message_case_keys[m.message_index] = msg_key

    groups: Dict[str, List[Tuple[MessageOCR, AttachmentOCR]]] = {}
    for m in messages:
        for a in m.attachment_ocr:
            if a.case_key:
                groups.setdefault(a.case_key, []).append((m, a))

    summaries: Dict[str, Dict[str, Any]] = {}
    for key, items in groups.items():
        items.sort(key=lambda pair: (pair[0].message_index, pair[1].attachment_index))
        total = len(items)
        current_m, current_a = items[-1]
        all_names = merge_unique(name for _, a in items for name in a.names)
        all_phones = merge_unique(phone for _, a in items for phone in a.phones)
        for idx, (m, a) in enumerate(items, start=1):
            a.version_index = idx
            a.version_total = total
            if idx == total:
                a.version_status = "CURRENT"
                a.superseded_by_message_index = 0
                a.superseded_by_attachment_path = ""
            else:
                a.version_status = "SUPERSEDED"
                a.superseded_by_message_index = current_m.message_index
                a.superseded_by_attachment_path = current_a.original_path
        summaries[key] = {
            "case_key": key,
            "version_count": total,
            "current_message_index": current_m.message_index,
            "current_attachment_path": current_a.original_path,
            "names": all_names,
            "phones": all_phones,
            "all_versions": [
                {
                    "message_index": m.message_index,
                    "attachment_path": a.original_path,
                    "status": a.version_status,
                    "reason": a.version_reason,
                }
                for m, a in items
            ],
        }
    return summaries


def make_outputs(export_root: Path, messages: List[MessageOCR], out_dir: Path, case_summaries: Dict[str, Dict[str, Any]]) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)

    # JSON
    json_data = {
        "source_export": str(export_root),
        "cases": case_summaries,
        "messages": [
            {
                **{k: v for k, v in asdict(m).items() if k != "attachment_ocr"},
                "attachment_ocr": [asdict(a) for a in m.attachment_ocr],
            }
            for m in messages
        ],
    }
    (out_dir / "messages_ocr.json").write_text(json.dumps(json_data, ensure_ascii=False, indent=2), encoding="utf-8")

    # Structured form outputs: Markdown for human review, JSON/CSV for matching.
    forms_index: List[Dict[str, Any]] = []
    flat_rows: List[Dict[str, Any]] = []
    for m in messages:
        for a in m.attachment_ocr:
            if a.status != "ok":
                continue
            md_rel = write_form_markdown(out_dir, m, a)
            form = a.structured or {}
            fields = form.get("fields", {}) if isinstance(form, dict) else {}
            normalized = form.get("normalized", {}) if isinstance(form, dict) else {}
            item = {
                "message_index": m.message_index,
                "message_id": m.message_id,
                "datetime": m.datetime,
                "author": m.author,
                "message_url": m.message_url,
                "message_url_source": m.message_url_source,
                "max_chat_url": m.max_chat_url,
                "local_export_anchor": m.local_export_anchor,
                "message_text": m.text,
                "reply_to_message_index": m.reply_to_message_index,
                "reply_text": m.reply_text,
                "attachment_path": a.original_path,
                "form_markdown_path": md_rel,
                "case_key": a.case_key,
                "version_index": a.version_index,
                "version_total": a.version_total,
                "version_status": a.version_status,
                "superseded_by_message_index": a.superseded_by_message_index,
                "superseded_by_attachment_path": a.superseded_by_attachment_path,
                "form": form,
            }
            forms_index.append(item)
            flat = {
                "message_index": m.message_index,
                "datetime": m.datetime,
                "author": m.author,
                "message_url": m.message_url,
                "message_url_source": m.message_url_source,
                "max_chat_url": m.max_chat_url,
                "local_export_anchor": m.local_export_anchor,
                "message_text": m.text,
                "reply_to_message_index": m.reply_to_message_index or "",
                "reply_text": m.reply_text,
                "attachment_path": a.original_path,
                "form_markdown_path": md_rel,
                "case_key": a.case_key,
                "version_status": a.version_status,
                "version_index": a.version_index or "",
                "version_total": a.version_total or "",
                "match_keys": "; ".join(form.get("match_keys", [])) if isinstance(form, dict) else "",
            }
            for key, value in fields.items():
                flat[key] = value
            for key, value in normalized.items():
                flat["norm_" + key] = json.dumps(value, ensure_ascii=False) if isinstance(value, list) else value
            flat_rows.append(flat)

    forms_json = {
        "source_export": str(export_root),
        "description": "Одна запись = одно OCR-вложение/анкета. Markdown — для человека; fields/normalized/match_keys — для матчинга.",
        "forms": forms_index,
    }
    (out_dir / "forms_structured.json").write_text(json.dumps(forms_json, ensure_ascii=False, indent=2), encoding="utf-8")

    if flat_rows:
        all_keys: List[str] = []
        preferred = [
            "message_index", "datetime", "author", "message_url", "message_url_source", "max_chat_url", "local_export_anchor", "message_text", "reply_to_message_index", "reply_text",
            "attachment_path", "form_markdown_path", "case_key", "version_status", "version_index", "version_total", "match_keys",
            "borrower_full_name", "borrower_birth_date", "mobile_phone", "passport_series_number", "passport_issued_by",
            "contact_person_name", "contact_person_phone", "employer_name", "employer_inn", "work_phone", "monthly_income",
            "car_price", "down_payment", "car_make_model", "car_year",
            "norm_borrower_full_name_key", "norm_borrower_birth_date_iso", "norm_mobile_phone_norm",
            "norm_passport_series_number_norm", "norm_employer_inn_norm", "norm_all_phones_norm",
        ]
        for k in preferred:
            if any(k in r for r in flat_rows):
                all_keys.append(k)
        for r in flat_rows:
            for k in r.keys():
                if k not in all_keys:
                    all_keys.append(k)
        with (out_dir / "forms_flat.csv").open("w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=all_keys)
            writer.writeheader()
            for row in flat_rows:
                writer.writerow(row)

    # TXT
    txt_parts: List[str] = []
    for m in messages:
        txt_parts.append(f"#{m.message_index}")
        if m.datetime or m.author:
            meta = " | ".join(x for x in [m.datetime, m.author] if x)
            txt_parts.append(meta)
        if m.message_url:
            txt_parts.append("Ссылка MAX: " + m.message_url)
        elif m.max_chat_url:
            txt_parts.append("Ссылка MAX: не найдена; чат: " + m.max_chat_url)
        if m.reply_text:
            target = f"#{m.reply_to_message_index}" if m.reply_to_message_index else "цель не найдена"
            txt_parts.append(f"Ответ на: {target}")
            txt_parts.append("Цитата reply: " + m.reply_text)
        txt_parts.append(m.text or "[без текста]")
        txt_parts.append("")
        if m.attachment_paths:
            txt_parts.append("Вложения к этому сообщению:")
            for p in m.attachment_paths:
                txt_parts.append(f"- {p}")
        if m.attachment_ocr:
            for a in m.attachment_ocr:
                txt_parts.append("")
                txt_parts.append(f"Расшифровка img: {a.original_path}")
                if a.case_key:
                    txt_parts.append(f"Версия анкеты: {a.version_index}/{a.version_total} — {a.version_status} — {a.case_key}")
                    if a.version_status == "SUPERSEDED":
                        txt_parts.append(f"Актуальная версия: сообщение #{a.superseded_by_message_index}, {a.superseded_by_attachment_path}")
                if a.status != "ok":
                    txt_parts.append(f"[OCR {a.status}: {a.error}]")
                else:
                    if a.names or a.phones:
                        txt_parts.append("Извлеченные поля:")
                        if a.names:
                            txt_parts.append("ФИО: " + "; ".join(a.names))
                        if a.phones:
                            txt_parts.append("Телефон: " + "; ".join(a.phones))
                        txt_parts.append("")
                    txt_parts.append(a.ocr_text or "[текст не распознан]")
        txt_parts.append("\n" + "-" * 80 + "\n")
    (out_dir / "messages_ocr.txt").write_text("\n".join(txt_parts), encoding="utf-8")

    # CSV summary
    with (out_dir / "ocr_summary.csv").open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "message_index",
                "datetime",
                "author",
                "reply_to_message_index",
                "reply_text",
                "message_text",
                "attachment_path",
                "ocr_status",
                "case_key",
                "version_index",
                "version_total",
                "version_status",
                "superseded_by",
                "names",
                "phones",
                "ocr_text",
            ],
        )
        writer.writeheader()
        for m in messages:
            if not m.attachment_ocr:
                writer.writerow(
                    {
                        "message_index": m.message_index,
                        "datetime": m.datetime,
                        "author": m.author,
                        "reply_to_message_index": m.reply_to_message_index or "",
                        "reply_text": m.reply_text,
                        "message_text": m.text,
                        "attachment_path": "",
                        "ocr_status": "no_attachments",
                        "case_key": m.case_key,
                        "version_index": "",
                        "version_total": "",
                        "version_status": "",
                        "superseded_by": "",
                        "names": "",
                        "phones": "",
                        "ocr_text": "",
                    }
                )
            for a in m.attachment_ocr:
                writer.writerow(
                    {
                        "message_index": m.message_index,
                        "datetime": m.datetime,
                        "author": m.author,
                        "reply_to_message_index": m.reply_to_message_index or "",
                        "reply_text": m.reply_text,
                        "message_text": m.text,
                        "attachment_path": a.original_path,
                        "ocr_status": a.status,
                        "case_key": a.case_key,
                        "version_index": a.version_index or "",
                        "version_total": a.version_total or "",
                        "version_status": a.version_status,
                        "superseded_by": a.superseded_by_attachment_path,
                        "names": "; ".join(a.names),
                        "phones": "; ".join(a.phones),
                        "ocr_text": a.ocr_text,
                    }
                )

    # Case/version summary
    with (out_dir / "cases_summary.csv").open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "case_key",
                "version_count",
                "current_message_index",
                "current_attachment_path",
                "names",
                "phones",
                "all_versions",
            ],
        )
        writer.writeheader()
        for case in case_summaries.values():
            writer.writerow(
                {
                    "case_key": case.get("case_key", ""),
                    "version_count": case.get("version_count", ""),
                    "current_message_index": case.get("current_message_index", ""),
                    "current_attachment_path": case.get("current_attachment_path", ""),
                    "names": "; ".join(case.get("names", [])),
                    "phones": "; ".join(case.get("phones", [])),
                    "all_versions": json.dumps(case.get("all_versions", []), ensure_ascii=False),
                }
            )

    # HTML
    html_parts = [
        "<!doctype html>",
        '<html lang="ru"><head><meta charset="utf-8">',
        "<title>MAX OCR Export</title>",
        "<style>",
        "body{font-family:Arial,sans-serif;margin:24px;line-height:1.45;background:#f6f6f6;color:#111}",
        ".msg{background:white;border:1px solid #ddd;border-radius:12px;padding:16px;margin:0 0 16px}",
        ".meta{color:#666;font-size:13px;margin-bottom:8px}",
        ".text{white-space:pre-wrap;font-size:16px;margin:10px 0}",
        ".att{border-left:4px solid #ccc;padding-left:12px;margin-top:12px}",
        "img{max-width:420px;max-height:420px;display:block;border:1px solid #ddd;margin:8px 0}",
        "pre{white-space:pre-wrap;background:#f2f2f2;padding:12px;border-radius:8px;overflow:auto}",
        ".fields{background:#fff7d6;border:1px solid #e0c66b;padding:8px;border-radius:8px;margin:8px 0}",
        ".reply{background:#eef4ff;border-left:4px solid #78a6ff;padding:8px;border-radius:8px;margin:8px 0}",
        ".version{font-weight:bold;padding:6px 8px;border-radius:8px;margin:8px 0;background:#eef8ec;border:1px solid #9ccd91}",
        ".superseded{background:#fff0ee;border-color:#d9aaa3}",
        "</style></head><body>",
        "<h1>MAX OCR Export</h1>",
    ]
    for m in messages:
        html_parts.append('<section class="msg">')
        html_parts.append(f"<h2>#{m.message_index}</h2>")
        meta = " | ".join(x for x in [m.datetime, m.author] if x)
        if meta:
            html_parts.append(f'<div class="meta">{html.escape(meta)}</div>')
        if m.message_url:
            html_parts.append(f'<div class="meta"><a href="{html.escape(m.message_url)}" target="_blank" rel="noopener">Ссылка MAX</a></div>')
        elif m.max_chat_url:
            html_parts.append(f'<div class="meta">Ссылка MAX не найдена; чат: <a href="{html.escape(m.max_chat_url)}" target="_blank" rel="noopener">открыть чат</a></div>')
        if m.reply_text:
            target = f"#{m.reply_to_message_index}" if m.reply_to_message_index else "цель не найдена"
            html_parts.append(f'<div class="reply"><b>Ответ на:</b> {html.escape(target)}<br><b>Цитата:</b><br>{html.escape(m.reply_text)}</div>')
        html_parts.append(f'<div class="text">{html.escape(m.text or "[без текста]")}</div>')
        if m.attachment_paths:
            html_parts.append("<b>Вложения к этому сообщению:</b><ul>")
            for p in m.attachment_paths:
                html_parts.append(f"<li>{html.escape(p)}</li>")
            html_parts.append("</ul>")
        for a in m.attachment_ocr:
            html_parts.append('<div class="att">')
            html_parts.append(f"<h3>Расшифровка img: {html.escape(a.original_path)}</h3>")
            src_path = resolve_attachment(export_root, a.original_path)
            if src_path:
                try:
                    rel_from_out = os.path.relpath(src_path, out_dir)
                    html_parts.append(f'<img src="{html.escape(rel_from_out)}" alt="attachment">')
                except Exception:
                    pass
            if a.case_key:
                css = "version" if a.version_status == "CURRENT" else "version superseded"
                version_text = f"Версия анкеты: {a.version_index}/{a.version_total} — {a.version_status} — {a.case_key}"
                if a.version_status == "SUPERSEDED":
                    version_text += f"; актуальная: сообщение #{a.superseded_by_message_index}, {a.superseded_by_attachment_path}"
                html_parts.append(f'<div class="{css}">{html.escape(version_text)}</div>')
            form_fields = (a.structured or {}).get("fields", {}) if isinstance(a.structured, dict) else {}
            if form_fields:
                html_parts.append('<div class="fields"><b>Структурированная анкета:</b><br>')
                for label, key in [
                    ("ФИО", "borrower_full_name"), ("Дата рождения", "borrower_birth_date"),
                    ("Мобильный", "mobile_phone"), ("Паспорт", "passport_series_number"),
                    ("Работодатель", "employer_name"), ("Рабочий телефон", "work_phone"),
                    ("Доход", "monthly_income"), ("Авто", "car_make_model"),
                ]:
                    value = form_fields.get(key, "")
                    if value:
                        html_parts.append(f"{html.escape(label)}: {html.escape(str(value))}<br>")
                html_parts.append("</div>")
            elif a.names or a.phones:
                html_parts.append('<div class="fields"><b>Извлеченные поля:</b><br>')
                if a.names:
                    html_parts.append("ФИО: " + html.escape("; ".join(a.names)) + "<br>")
                if a.phones:
                    html_parts.append("Телефон: " + html.escape("; ".join(a.phones)) + "<br>")
                html_parts.append("</div>")
            if a.status != "ok":
                html_parts.append(f"<p><b>OCR {html.escape(a.status)}:</b> {html.escape(a.error)}</p>")
            else:
                html_parts.append(f"<pre>{html.escape(a.ocr_text or '[текст не распознан]')}</pre>")
            html_parts.append("</div>")
        html_parts.append("</section>")
    html_parts.append("</body></html>")
    (out_dir / "index_ocr.html").write_text("\n".join(html_parts), encoding="utf-8")

    (out_dir / "README_OCR.txt").write_text(
        "Открывайте index_ocr.html для просмотра связки сообщение -> вложение -> OCR.\n"
        "messages_ocr.txt — текстовый рабочий файл.\n"
        "messages_ocr.json — машинно-читаемая структура.\n"
        "ocr_summary.csv — таблица для Excel/Google Sheets.\n"
        "cases_summary.csv — таблица актуальных/устаревших версий анкет по case_key.\n"
        "forms_md/ — отдельные Markdown-файлы анкет с таблицами полей.\n"
        "forms_structured.json — структурированные анкеты для автоматического матчинга.\n"
        "forms_flat.csv — плоская таблица анкет для Excel/Google Sheets/матчинга.\n"
        "ocr_raw/ — сырые OCR-расшифровки по каждому вложению.\n",
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Локальный OCR-процессор для экспорта MAX")
    parser.add_argument("input", help="Папка экспорта MAX или ZIP, созданный расширением")
    parser.add_argument("-o", "--output", default="", help="Папка результата. По умолчанию рядом с экспортом")
    parser.add_argument("--lang", default=DEFAULT_LANG, help="Языки Tesseract, например rus+eng")
    parser.add_argument("--tesseract", default="tesseract", help="Путь к tesseract.exe / tesseract")
    parser.add_argument("--psm", type=int, default=6, help="Page segmentation mode Tesseract. 6 — блок текста, 11 — sparse text")
    parser.add_argument("--timeout", type=int, default=90, help="Таймаут OCR одного изображения, секунд")
    args = parser.parse_args()

    input_path = Path(args.input).expanduser().resolve()
    log(f"MAX Chat OCR Postprocessor v{VERSION}")
    ensure_tesseract_available(args.tesseract)

    with tempfile.TemporaryDirectory(prefix="max_export_") as tmp:
        root = unpack_if_needed(input_path, Path(tmp))
        export_root = find_export_root(root)
        if args.output:
            out_dir = Path(args.output).expanduser().resolve()
        else:
            base = input_path.stem if input_path.is_file() else export_root.name
            out_dir = input_path.parent / f"{base}_OCR"
        out_dir.mkdir(parents=True, exist_ok=True)

        messages_raw = normalize_messages(export_root)
        log(f"Найдено сообщений: {len(messages_raw)}")

        enriched: List[MessageOCR] = []
        total_attachments = sum(len(m["attachment_paths"]) for m in messages_raw)
        done = 0
        for msg in messages_raw:
            attachment_results: List[AttachmentOCR] = []
            for i, rel_path in enumerate(msg["attachment_paths"], start=1):
                done += 1
                log(f"OCR {done}/{total_attachments}: сообщение #{msg['message_index']}, {rel_path}")
                attachment_results.append(
                    ocr_attachment(
                        export_root=export_root,
                        rel_path=rel_path,
                        message_index=msg["message_index"],
                        attachment_index=i,
                        out_dir=out_dir,
                        tesseract_cmd=args.tesseract,
                        lang=args.lang,
                        psm=args.psm,
                        timeout=args.timeout,
                    )
                )
            enriched.append(
                MessageOCR(
                    message_index=msg["message_index"],
                    message_id=msg["message_id"],
                    author=msg["author"],
                    datetime=msg["datetime"],
                    message_url=msg.get("message_url", ""),
                    message_url_source=msg.get("message_url_source", ""),
                    max_chat_url=msg.get("max_chat_url", ""),
                    local_export_anchor=msg.get("local_export_anchor", ""),
                    text=msg["text"],
                    attachment_paths=msg["attachment_paths"],
                    attachment_ocr=attachment_results,
                    reply_to_message_index=msg.get("reply_to_message_index", 0),
                    reply_to_message_id=msg.get("reply_to_message_id", ""),
                    reply_text=msg.get("reply_text", ""),
                    text_full=msg.get("text_full", ""),
                )
            )

        case_summaries = assign_form_versions(enriched)
        make_outputs(export_root, enriched, out_dir, case_summaries)
        log(f"Готово: {out_dir}")
        log(f"Версионных групп: {len(case_summaries)}")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
