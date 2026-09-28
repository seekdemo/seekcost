"""Parse user-uploaded watchlist groups without persisting source files."""
from __future__ import annotations

import csv
from dataclasses import dataclass
import io
from pathlib import Path
import re


_SYMBOL_HEADERS = {"代码", "股票代码", "证券代码", "symbol", "ticker", "code"}
_GROUP_HEADERS = {"分类", "分组", "概念", "category", "group", "theme", "concept"}
_ENCODINGS = ("utf-8-sig", "utf-8", "gb18030", "gbk")


class ClassificationFileError(ValueError):
    pass


@dataclass(frozen=True)
class ParsedClassificationGroup:
    key: str
    source_filename: str
    suggested_name: str
    symbols: frozenset[str]


def normalize_classification_symbol(raw: str) -> str:
    symbol = raw.strip().strip('"').upper().replace(" ", "")
    for suffix in (".US", ".HK", ".SH", ".SZ", ".SS", ".TW", ".TWO", ".BJ"):
        if symbol.endswith(suffix):
            symbol = symbol[: -len(suffix)]
            break
    return symbol.removeprefix(".")


def category_name_from_filename(filename: str) -> str:
    stem = Path(filename).stem.strip()
    match = re.search(r"(?:^|[_-])(?:CSV_)?\d+\.\s*(.+)$", stem, flags=re.IGNORECASE)
    if match:
        return match.group(1).strip()
    match = re.search(r"\d+\.\s*(.+)$", stem)
    return match.group(1).strip() if match else stem


def _decode_csv(content: bytes, filename: str) -> str:
    for encoding in _ENCODINGS:
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise ClassificationFileError(f"Could not decode {filename}; use UTF-8 or GBK")


def _find_column(fieldnames: list[str], aliases: set[str]) -> str | None:
    for field in fieldnames:
        if field.strip().lower() in aliases:
            return field
    return None


def parse_classification_file(filename: str, content: bytes, file_index: int) -> list[ParsedClassificationGroup]:
    text = _decode_csv(content, filename)
    reader = csv.DictReader(io.StringIO(text))
    fieldnames = [field for field in (reader.fieldnames or []) if field]
    symbol_column = _find_column(fieldnames, _SYMBOL_HEADERS)
    if not symbol_column:
        raise ClassificationFileError(f"{filename} must include a Symbol or 代码 column")
    group_column = _find_column(fieldnames, _GROUP_HEADERS)
    filename_category = category_name_from_filename(filename)
    grouped_symbols: dict[str, set[str]] = {}

    for row in reader:
        symbol = normalize_classification_symbol(str(row.get(symbol_column) or ""))
        if not symbol:
            continue
        category = str(row.get(group_column) or "").strip() if group_column else filename_category
        if not category:
            continue
        grouped_symbols.setdefault(category, set()).add(symbol)

    if not grouped_symbols:
        raise ClassificationFileError(f"{filename} has no usable classification rows")

    return [
        ParsedClassificationGroup(
            key=f"file-{file_index}-group-{group_index}",
            source_filename=Path(filename).name,
            suggested_name=category,
            symbols=frozenset(symbols),
        )
        for group_index, (category, symbols) in enumerate(grouped_symbols.items(), start=1)
    ]


def parse_classification_files(files: list[tuple[str, bytes]]) -> list[ParsedClassificationGroup]:
    groups: list[ParsedClassificationGroup] = []
    for file_index, (filename, content) in enumerate(files, start=1):
        groups.extend(parse_classification_file(filename, content, file_index))
    return groups
