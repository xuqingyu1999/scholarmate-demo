from __future__ import annotations

import csv
import hashlib
import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path
from xml.etree import ElementTree as ET

import fitz
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_XML = Path(
    r"C:\Users\12415\OneDrive\xwechat_files\wxid_eygf0iqankh221_5414\msg\file\2026-05\0_20201_135169_16_1(1).xml"
)
PATENT_DIR = ROOT / "patent_originals"
PATENT_ASSET_DIR = ROOT / "assets" / "patents"
SCHOLAR_ASSET_DIR = ROOT / "assets" / "scholars"
MAIN_JS = ROOT / "scripts" / "main.js"
SEED_FILE = ROOT / "data" / "cityu-scholar-paper-seeds.json"

HTTP_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36"
    )
}

COLORS = [
    "#2563eb",
    "#0f766e",
    "#7c3aed",
    "#dc2626",
    "#ea580c",
    "#0891b2",
    "#16a34a",
    "#be123c",
    "#047857",
    "#4f46e5",
]

INDUSTRY_RULES = [
    ("医疗健康", "medical-sensing", ["medical", "breathing", "respiratory", "radar", "human body", "醫療", "呼吸", "雷達", "人体"]),
    ("智能纺织", "smart-textile", ["fabric", "textile", "thermal regulating", "bionic", "織物", "布料", "热调节", "仿生"]),
    ("区块链可信内容", "blockchain-trust", ["blockchain", "ethereum", "nft", "private key", "ddos", "middleware", "區塊鏈", "私鑰", "分佈式拒絕", "溯源", "假新聞"]),
    ("工程优化", "engineering-optimization", ["optimization", "polynomial", "integer variables", "solver", "parallel", "工程", "優化"]),
    ("信息检索", "enterprise-search", ["search", "query", "document", "textual data", "electronic documents", "檢索", "搜索"]),
    ("计算机视觉", "computer-vision", ["visual tracking", "creating an image", "image", "tracking", "視覺", "图像"]),
    ("新能源汽车", "vehicle-control", ["new energy automobile", "stability control", "vehicle", "新能源", "汽車", "稳定控制"]),
    ("智能硬件", "sensor-hardware", ["light sensor", "sensor", "光传感", "傳感器"]),
    ("企业服务", "ai-patent-intelligence", ["large language model", "patent recommendation", "patent quality", "heterogeneous data", "dynamic attention", "高校專利", "專利質量"]),
]


def normalize_id(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9]+", "", value or "")
    return cleaned or hashlib.sha1(value.encode("utf-8")).hexdigest()[:10]


def slugify_name(name: str) -> str:
    parts = re.findall(r"[A-Za-z0-9]+", name.lower())
    return "_".join(parts) or hashlib.sha1(name.encode("utf-8")).hexdigest()[:10]


def display_name(raw: str) -> str:
    if "," in raw:
        family, given = [part.strip() for part in raw.split(",", 1)]
        return f"{given.title()} {family.upper()}".strip()
    return raw.strip()


def first_token(name: str) -> str:
    cleaned = display_name(name)
    if re.search(r"[\u4e00-\u9fff]", cleaned):
        return cleaned[:1]
    tokens = [item for item in re.split(r"\s+", cleaned) if item]
    return "".join(token[:1] for token in tokens[:2]).upper() or "SM"


def avatar_data_url(name: str, affiliation: str, color: str) -> str:
    initials = html.escape(first_token(name))
    label = html.escape(f"{display_name(name)} / {affiliation}")
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" '
        f'role="img" aria-label="{label}">'
        f'<rect width="96" height="96" rx="18" fill="{color}"/>'
        '<circle cx="70" cy="24" r="12" fill="rgba(255,255,255,0.24)"/>'
        '<path d="M18 68h60" stroke="rgba(255,255,255,0.42)" stroke-width="4" stroke-linecap="round"/>'
        f'<text x="48" y="56" text-anchor="middle" font-family="Arial, sans-serif" '
        f'font-size="24" font-weight="700" fill="#fff">{initials}</text></svg>'
    )
    return "data:image/svg+xml;utf8," + urllib.parse.quote(svg)


def text_attr(node: ET.Element, key: str) -> str:
    return (node.attrib.get(key) or "").strip()


def choose_title(pub: ET.Element) -> str:
    return text_attr(pub, "etitle") or text_attr(pub, "ctitle") or "Untitled patent"


def choose_summary(pub: ET.Element) -> str:
    return text_attr(pub, "eabstract") or text_attr(pub, "cabstract") or "This CityUHK patent record is available from the public CityUHK Scholars metadata. The original patent text has not been publicly available in the local archive yet."


def infer_domain(pub: ET.Element) -> tuple[str, str, list[str]]:
    text = " ".join(
        [
            choose_title(pub),
            choose_summary(pub),
            text_attr(pub, "patent_main_category_no"),
            text_attr(pub, "patent_category_no"),
        ]
    ).lower()
    for industry, field, needles in INDUSTRY_RULES:
        if any(needle.lower() in text for needle in needles):
            return industry, field, needles[:5]
    return "企业服务", "technology-transfer", ["CityUHK", "patent", "technology transfer", "commercialization"]


def load_manifest() -> dict[str, dict[str, str]]:
    manifest = {}
    path = PATENT_DIR / "patent_originals_manifest.csv"
    if not path.exists():
        return manifest
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            seq = str(row.get("seq", "")).strip()
            manifest[seq] = row
    return manifest


def local_original_for(seq: str, pub_number: str, manifest: dict[str, dict[str, str]]) -> tuple[str, str]:
    row = manifest.get(seq, {})
    candidates = []
    local_file = row.get("local_file") or ""
    if local_file:
        candidates.append(Path(local_file).name)
    if seq == "8":
        candidates.append("08_CN114117510A.pdf")
    candidates.extend(path.name for path in PATENT_DIR.glob(f"{int(seq):02d}_*") if seq.isdigit())
    candidates.extend(path.name for path in PATENT_DIR.glob(f"*{pub_number}*"))
    for name in candidates:
        path = PATENT_DIR / name
        if path.exists():
            return path.as_posix().replace(ROOT.as_posix() + "/", ""), name
    return "", ""


def source_pdf_for_image(seq: str, local_name: str) -> Path | None:
    if local_name.lower().endswith(".pdf"):
        return PATENT_DIR / local_name
    if seq == "8":
        alt = PATENT_DIR / "08_CN114117510A.pdf"
        if alt.exists():
            return alt
    return None


def save_patent_preview(pdf_path: Path, out_path: Path) -> bool:
    try:
        doc = fitz.open(pdf_path)
    except Exception:
        return False
    out_path.parent.mkdir(parents=True, exist_ok=True)
    best = None
    best_score = 0
    try:
        for page_index in range(min(len(doc), 6)):
            page = doc[page_index]
            for image_info in page.get_images(full=True):
                xref = image_info[0]
                width = image_info[2]
                height = image_info[3]
                if width < 160 or height < 120:
                    continue
                score = width * height
                if score <= best_score:
                    continue
                try:
                    extracted = doc.extract_image(xref)
                    best = extracted["image"]
                    best_score = score
                except Exception:
                    continue
        if best:
            tmp = out_path.with_suffix(".tmp")
            tmp.write_bytes(best)
            with Image.open(tmp) as image:
                image.thumbnail((1000, 760))
                image.convert("RGB").save(out_path, "PNG", optimize=True)
            tmp.unlink(missing_ok=True)
            return True

        if len(doc):
            page = doc[0]
            pixmap = page.get_pixmap(matrix=fitz.Matrix(1.55, 1.55), alpha=False)
            pixmap.save(out_path)
            return True
    finally:
        doc.close()
    return False


def fetch(url: str, timeout: int = 18) -> bytes:
    request = urllib.request.Request(url, headers=HTTP_HEADERS)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def extract_between(text: str, pattern: str) -> str:
    match = re.search(pattern, text, re.I | re.S)
    if not match:
        return ""
    return html.unescape(re.sub(r"<[^>]+>", " ", match.group(1))).strip()


def absolute_url(url: str) -> str:
    return urllib.parse.urljoin("https://scholars.cityu.edu.hk", url)


def find_doi(text: str) -> str:
    match = re.search(r"10\.\d{4,9}/[-._;()/:A-Z0-9]+", text, re.I)
    if not match:
        return ""
    return match.group(0).rstrip('".,;)</')


def openalex_open_access(doi: str) -> dict:
    if not doi:
        return {}
    try:
        url = "https://api.openalex.org/works/" + urllib.parse.quote(f"https://doi.org/{doi}", safe=":/")
        payload = json.loads(fetch(url).decode("utf-8", errors="ignore"))
        return payload.get("open_access") or {}
    except Exception:
        return {}


def try_download_pdf(url: str, target_dir: Path) -> tuple[str, bytes]:
    if not url:
        return "", b""
    file_id = hashlib.sha1(url.encode("utf-8")).hexdigest()[:10]
    filename = f"{file_id}.pdf"
    existing = target_dir / filename
    if existing.exists():
        data = existing.read_bytes()
        if data.startswith(b"%PDF"):
            return filename, data
    try:
        data = fetch(url)
    except Exception:
        return "", b""
    if not data.startswith(b"%PDF"):
        return "", b""
    (target_dir / filename).write_bytes(data)
    return filename, data


def paper_id(record: dict) -> str:
    basis = record.get("doi") or record.get("sourceUrl") or record.get("title") or "paper"
    return hashlib.sha1(str(basis).encode("utf-8")).hexdigest()[:12]


DIGITAL_SCHOLAR_SKILLS = [
    {
        "id": "patent_fact_extractor",
        "name": "Patent Fact Extractor",
        "description": "Extract current patent title, abstract, field, public source and local original facts before answering.",
        "sourceTypes": ["patent"],
        "priority": 100,
        "triggers": ["all_patent_questions", "selected_patent_context"],
    },
    {
        "id": "paper_evidence_retriever",
        "name": "Paper Evidence Retriever",
        "description": "Retrieve scholar-bound downloaded PDF chunks and metadata-only paper records that match the question.",
        "sourceTypes": ["paper_pdf", "paper_metadata"],
        "priority": 80,
        "triggers": ["research_basis", "technical_explanation", "business_analysis"],
    },
    {
        "id": "commercialization_assessor",
        "name": "Commercialization Assessor",
        "description": "Translate patent and paper evidence into enterprise scenarios, buyer fit and trial path assumptions.",
        "sourceTypes": ["patent", "paper_pdf", "paper_metadata", "user_input"],
        "priority": 70,
        "triggers": ["business_analysis", "licensing_next_step"],
    },
    {
        "id": "technical_due_diligence",
        "name": "Technical Due Diligence",
        "description": "Identify technical, data, equipment, integration and validation gaps that require follow-up.",
        "sourceTypes": ["patent", "paper_pdf", "paper_metadata"],
        "priority": 65,
        "triggers": ["technical_explanation", "risk_question", "business_analysis"],
    },
    {
        "id": "risk_guard",
        "name": "Risk Guard",
        "description": "Block overclaiming, fabricated citations, legal conclusions and treating metadata-only records as full text.",
        "sourceTypes": ["patent", "paper_pdf", "paper_metadata", "profile", "user_input"],
        "priority": 100,
        "triggers": ["all_answers", "risk_question", "legal_question"],
    },
    {
        "id": "citation_answer_builder",
        "name": "Citation Answer Builder",
        "description": "Build concise answers with explicit source boundaries and reference chips.",
        "sourceTypes": ["patent", "paper_pdf", "paper_metadata", "profile", "user_input"],
        "priority": 75,
        "triggers": ["all_answers"],
    },
]


GLOBAL_IDENTITY_RULES = [
    {
        "id": "identity_controlled_proxy",
        "priority": 100,
        "text": "This digital scholar is a controlled knowledge proxy built from public CityU-related scholar, patent and paper sources; it is not the live person speaking.",
    },
    {
        "id": "identity_no_institutional_commitment",
        "priority": 95,
        "text": "Do not claim to represent CityU, the inventor, or any assignee in making legal, licensing, investment or delivery commitments.",
    },
]


GLOBAL_EVIDENCE_RULES = [
    {
        "id": "evidence_type_boundary",
        "priority": 100,
        "text": "Every answer must distinguish patent facts, downloaded paper PDF evidence, metadata-only paper background, profile facts and user-provided context.",
    },
    {
        "id": "evidence_no_fabrication",
        "priority": 100,
        "text": "Do not fabricate papers, patent claims, market data, experiments, source files or downloadable PDFs.",
    },
    {
        "id": "evidence_metadata_limit",
        "priority": 90,
        "text": "Metadata-only paper records may support background framing, but must not be described as full-text evidence.",
    },
]


GLOBAL_PATENT_RULES = [
    {
        "id": "patent_first",
        "priority": 100,
        "text": "When a patent is selected, use it as the primary context before papers or general scholar profile.",
    },
    {
        "id": "no_claim_expansion",
        "priority": 100,
        "text": "Do not expand a paper's broad research finding into the legal scope of the current patent.",
    },
    {
        "id": "no_legal_conclusion",
        "priority": 95,
        "text": "Do not give definitive infringement, validity, enforceability or freedom-to-operate conclusions.",
    },
]


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def chunk_text(value: str, size: int = 850, overlap: int = 140) -> list[str]:
    text = clean_text(value)
    if not text:
        return []
    chunks = []
    start = 0
    while start < len(text):
        chunk = text[start:start + size].strip()
        if len(chunk) >= 80:
            chunks.append(chunk)
        if start + size >= len(text):
            break
        start += max(size - overlap, 1)
    return chunks


def extract_pdf_chunks(record: dict, scholar: dict, max_chunks: int = 8) -> list[dict]:
    local_file = record.get("file") or ""
    if not local_file:
        return []
    pdf_path = ROOT / local_file
    if not pdf_path.exists():
        return []

    chunks = []
    pid = record.get("paperId") or paper_id(record)
    try:
        doc = fitz.open(pdf_path)
        try:
            for page_index in range(len(doc)):
                page_text = clean_text(doc[page_index].get_text("text"))
                if not page_text:
                    continue
                for chunk_index, text in enumerate(chunk_text(page_text)):
                    chunks.append({
                        "id": f"{pid}_p{page_index + 1}_{chunk_index + 1}",
                        "paperId": pid,
                        "scholarId": scholar["id"],
                        "title": record.get("title") or "Untitled paper",
                        "year": record.get("year") or "",
                        "sourceType": "paper_pdf",
                        "downloadStatus": "downloaded_pdf",
                        "confidence": record.get("confidence") or "auto",
                        "page": page_index + 1,
                        "section": "pdf_text",
                        "text": text,
                        "topicTags": record.get("topicTags") or [],
                        "sourceUrl": record.get("sourceUrl") or "",
                        "file": local_file,
                    })
                    if len(chunks) >= max_chunks:
                        return chunks
        finally:
            doc.close()
    except Exception:
        chunks = []

    fallback = clean_text(record.get("description") or record.get("abstract") or "")
    if not chunks and fallback:
        chunks.append({
            "id": f"{pid}_fallback_1",
            "paperId": pid,
            "scholarId": scholar["id"],
            "title": record.get("title") or "Untitled paper",
            "year": record.get("year") or "",
            "sourceType": "paper_pdf",
            "downloadStatus": "downloaded_pdf",
            "confidence": record.get("confidence") or "auto",
            "page": None,
            "section": "description_fallback",
            "text": fallback[:850],
            "topicTags": record.get("topicTags") or [],
            "sourceUrl": record.get("sourceUrl") or "",
            "file": local_file,
            "extractionStatus": "description_fallback",
        })
    return chunks


def build_paper_memory(papers: list[dict], scholar: dict) -> list[dict]:
    memory = []
    for record in papers:
        pid = record.get("paperId") or paper_id(record)
        record["paperId"] = pid
        memory.append({
            "paperId": pid,
            "scholarId": scholar["id"],
            "title": record.get("title") or "Untitled paper",
            "year": record.get("year") or "",
            "authors": record.get("authors") or [scholar["name"]],
            "sourceType": "paper_pdf" if record.get("downloadStatus") == "downloaded_pdf" else "paper_metadata",
            "downloadStatus": record.get("downloadStatus") or "metadata_only",
            "confidence": record.get("confidence") or "auto",
            "topicTags": record.get("topicTags") or [],
            "sourceUrl": record.get("sourceUrl") or "",
            "file": record.get("file") or "",
            "description": clean_text(record.get("description") or record.get("abstract") or record.get("note") or ""),
        })
    return memory


def build_knowledge_index(scholar: dict, papers: list[dict]) -> dict:
    knowledge_dir = SCHOLAR_ASSET_DIR / scholar["id"] / "knowledge"
    knowledge_dir.mkdir(parents=True, exist_ok=True)
    chunks = []
    metadata_records = []
    for record in papers:
        if record.get("downloadStatus") == "downloaded_pdf":
            chunks.extend(extract_pdf_chunks(record, scholar))
        else:
            metadata_records.append({
                "paperId": record.get("paperId") or paper_id(record),
                "scholarId": scholar["id"],
                "title": record.get("title") or "Untitled paper",
                "year": record.get("year") or "",
                "sourceType": "paper_metadata",
                "downloadStatus": record.get("downloadStatus") or "metadata_only",
                "confidence": record.get("confidence") or "auto",
                "topicTags": record.get("topicTags") or [],
                "description": clean_text(record.get("description") or record.get("abstract") or record.get("note") or ""),
                "sourceUrl": record.get("sourceUrl") or "",
            })

    topics = []
    for record in papers:
        for tag in record.get("topicTags") or []:
            if tag and tag not in topics:
                topics.append(tag)

    index = {
        "scholarId": scholar["id"],
        "scholarName": scholar["name"],
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "sourceTypes": ["patent", "paper_pdf", "paper_metadata", "profile", "user_input"],
        "paperCount": len(papers),
        "downloadedPdfCount": sum(1 for paper in papers if paper.get("downloadStatus") == "downloaded_pdf"),
        "metadataOnlyCount": sum(1 for paper in papers if paper.get("downloadStatus") != "downloaded_pdf"),
        "chunkCount": len(chunks),
        "topics": topics[:24],
        "chunks": chunks,
        "metadataRecords": metadata_records,
    }
    index_path = knowledge_dir / "index.json"
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")
    return {
        "path": f"assets/scholars/{scholar['id']}/knowledge/index.json",
        "paperCount": index["paperCount"],
        "downloadedPdfCount": index["downloadedPdfCount"],
        "metadataOnlyCount": index["metadataOnlyCount"],
        "chunkCount": index["chunkCount"],
        "topics": index["topics"],
        "sourceTypes": index["sourceTypes"],
        "chunks": chunks[:32],
        "metadataRecords": metadata_records[:24],
    }


def build_scholar_rules(scholar: dict) -> list[dict]:
    fields = scholar.get("expertise") or ["CityUHK patent commercialization"]
    return [
        {
            "id": "scholar_field_scope",
            "priority": 85,
            "text": f"Prefer answers grounded in {scholar['name']}'s public patent ownership, paper background and expertise fields.",
            "fields": fields,
        },
        {
            "id": "scholar_voice",
            "priority": 55,
            "text": "Use a cautious, evidence-led, business-facing research advisor tone rather than a marketing persona.",
        },
        {
            "id": "scholar_gap_disclosure",
            "priority": 80,
            "text": "If the scholar-bound corpus lacks enough evidence, say what is missing and avoid filling gaps with guesses.",
        },
    ]


def build_patent_rules(patent_id: str) -> list[dict]:
    return [
        dict(rule, patentId=patent_id)
        for rule in GLOBAL_PATENT_RULES
    ]


def build_session_context_policy() -> dict:
    return {
        "selectedPatentPolicy": "active_patent_first",
        "longTermMemoryPolicy": "Only user preferences, enterprise demand context and conversation decisions may persist; scholar, patent and paper facts must come from controlled source data.",
        "answerContextPolicy": "Retrieve only the most relevant patent facts and top paper evidence for each turn.",
    }


def load_seed_data() -> dict:
    if not SEED_FILE.exists():
        return {"profiles": {}, "records": []}
    return json.loads(SEED_FILE.read_text(encoding="utf-8"))


def ensure_paper_record_defaults(record: dict, scholar: dict) -> dict:
    next_record = dict(record)
    next_record.setdefault("authors", [scholar["name"]])
    next_record.setdefault("year", "")
    next_record.setdefault("sourceUrl", "")
    next_record.setdefault("description", next_record.get("abstract") or next_record.get("note") or "Public scholarly background metadata for the digital advisor.")
    next_record.setdefault("confidence", "auto")
    next_record.setdefault("topicTags", [])
    next_record.setdefault("downloadStatus", "metadata_only")
    return next_record


def title_key(record: dict) -> str:
    doi = str(record.get("doi") or "").lower().strip()
    if doi:
        return f"doi:{doi}"
    title = re.sub(r"[^a-z0-9]+", "", str(record.get("title") or "").lower())
    return f"title:{title[:120]}"


def download_seed_record(seed_record: dict, scholar: dict) -> dict:
    record = ensure_paper_record_defaults(seed_record, scholar)
    paper_dir = SCHOLAR_ASSET_DIR / scholar["id"] / "papers"
    paper_dir.mkdir(parents=True, exist_ok=True)
    pdf_url = record.get("pdfUrl") or ""
    if pdf_url:
        filename, _ = try_download_pdf(pdf_url, paper_dir)
        if filename:
            record["downloadStatus"] = "downloaded_pdf"
            record["file"] = f"assets/scholars/{scholar['id']}/papers/{filename}"
            record["downloadUrl"] = pdf_url
        else:
            record["downloadStatus"] = "metadata_only"
            record["note"] = (record.get("note") or "Public PDF URL was recorded, but scripted download did not return a PDF.")
    else:
        record["downloadStatus"] = "metadata_only"
    return record


def curated_papers_for_scholar(seed_data: dict, scholar: dict) -> list[dict]:
    papers = []
    for record in seed_data.get("records", []):
        if record.get("scholarId") == scholar["id"]:
            papers.append(download_seed_record(record, scholar))
    return papers


def merge_paper_records(primary: list[dict], secondary: list[dict], scholar: dict) -> list[dict]:
    merged = []
    seen = set()
    for record in primary + secondary:
        normalized = ensure_paper_record_defaults(record, scholar)
        key = title_key(normalized)
        if key in seen or key == "title:":
            continue
        seen.add(key)
        merged.append(normalized)
    return merged


def scrape_profile_papers(scholar: dict) -> list[dict]:
    au_id = scholar.get("auId") or ""
    profile_url = scholar.get("profileUrl") or ""
    if not au_id or not profile_url:
        return []
    try:
        page = fetch(profile_url).decode("utf-8", errors="ignore")
    except Exception as error:
        return [{
            "title": f"CityUHK Scholars profile unavailable for {scholar['name']}",
            "authors": [scholar["name"]],
            "year": "",
            "sourceUrl": profile_url,
            "downloadStatus": "metadata_only",
            "note": f"Profile fetch failed: {error}",
        }]

    links = []
    seen = set()
    for match in re.finditer(r'href="([^"]*/en/publications/[^"]+)"[^>]*>(.*?)</a>', page, re.I | re.S):
        url = absolute_url(match.group(1))
        title = html.unescape(re.sub(r"<[^>]+>", " ", match.group(2))).strip()
        title = re.sub(r"\s+", " ", title)
        if not title or url in seen:
            continue
        seen.add(url)
        links.append((url, title))
        if len(links) >= 8:
            break

    papers = []
    paper_dir = SCHOLAR_ASSET_DIR / scholar["id"] / "papers"
    paper_dir.mkdir(parents=True, exist_ok=True)
    for url, title in links:
        record = {
            "title": title,
            "authors": [scholar["name"]],
            "year": "",
            "sourceUrl": url,
            "downloadStatus": "metadata_only",
            "confidence": "auto",
            "topicTags": [],
        }
        try:
            pub_page = fetch(url).decode("utf-8", errors="ignore")
            page_title = extract_between(pub_page, r"<h1[^>]*>(.*?)</h1>")
            if page_title:
                record["title"] = page_title
            doi = find_doi(pub_page)
            if doi:
                record["doi"] = doi
            year_match = re.search(r"<span[^>]*class=\"date\"[^>]*>([^<]*\b(?:19|20)\d{2}\b[^<]*)</span>", pub_page, re.I)
            if not year_match:
                year_match = re.search(r"\b(20\d{2}|19\d{2})\b", pub_page)
            if year_match:
                record["year"] = re.search(r"(20\d{2}|19\d{2})", year_match.group(0)).group(1)
            abstract = extract_between(pub_page, r'<div[^>]*class="[^"]*textblock[^"]*"[^>]*>(.*?)</div>')
            if abstract:
                record["abstract"] = re.sub(r"\s+", " ", abstract)[:1200]
                record["description"] = record["abstract"]
            pdf_urls = []
            for pdf_match in re.finditer(r'href="([^"]*(?:\.pdf|/files-asset/[^"]+)[^"]*)"', pub_page, re.I):
                pdf_url = absolute_url(pdf_match.group(1))
                if pdf_url not in pdf_urls:
                    pdf_urls.append(pdf_url)
            for pdf_url in pdf_urls[:2]:
                filename, data = try_download_pdf(pdf_url, paper_dir)
                if not filename:
                    continue
                record["downloadStatus"] = "downloaded_pdf"
                record["file"] = f"assets/scholars/{scholar['id']}/papers/{filename}"
                record["downloadUrl"] = pdf_url
                break
            if record["downloadStatus"] != "downloaded_pdf" and doi:
                oa = openalex_open_access(doi)
                if oa:
                    record["openAccess"] = {
                        "isOpenAccess": bool(oa.get("is_oa")),
                        "status": oa.get("oa_status") or "",
                        "url": oa.get("oa_url") or "",
                        "repositoryHasFullText": bool(oa.get("any_repository_has_fulltext")),
                    }
                    oa_url = oa.get("oa_url") or ""
                    if oa_url:
                        filename, data = try_download_pdf(oa_url, paper_dir)
                        if filename:
                            record["downloadStatus"] = "downloaded_pdf"
                            record["file"] = f"assets/scholars/{scholar['id']}/papers/{filename}"
                            record["downloadUrl"] = oa_url
        except Exception as error:
            record["note"] = f"Publication metadata fetch failed: {error}"
        papers.append(record)
        time.sleep(0.2)
    return papers


def build_catalog(xml_path: Path) -> tuple[list[dict], list[dict]]:
    tree = ET.parse(xml_path)
    manifest = load_manifest()
    seed_data = load_seed_data()
    scholars: dict[str, dict] = {}
    patents = []

    for data in tree.getroot().findall("data"):
        seq = text_attr(data, "seq_no")
        pub = data.find("publication")
        authors_node = data.find("pub_authors")
        if pub is None or authors_node is None:
            continue
        author_nodes = [node for node in authors_node.findall("author") if text_attr(node, "au")]
        cityu_author = None
        for author in author_nodes:
            haystack = " ".join([text_attr(author, "email"), text_attr(author, "dept")])
            if text_attr(author, "issearchorg") == "1" or "cityu.edu.hk" in haystack.lower() or "city university" in haystack.lower():
                cityu_author = author
                break
        if cityu_author is None and author_nodes:
            cityu_author = author_nodes[0]
        raw_name = text_attr(cityu_author, "au") if cityu_author is not None else "CityUHK Scholar"
        au_id = text_attr(cityu_author, "au_id") if cityu_author is not None else ""
        scholar_id = au_id or slugify_name(raw_name)
        dept = text_attr(cityu_author, "dept") if cityu_author is not None else text_attr(pub, "organization")

        pub_number = text_attr(pub, "patent_open_no") or text_attr(pub, "patent_no")
        patent_id = normalize_id(pub_number)
        title = choose_title(pub)
        summary = choose_summary(pub)
        industry, field, inferred_keywords = infer_domain(pub)
        local_original, local_name = local_original_for(seq, patent_id, manifest)
        source_pdf = source_pdf_for_image(seq, local_name)
        image_url = ""
        if source_pdf and source_pdf.exists():
            image_path = PATENT_ASSET_DIR / f"{patent_id}.png"
            if save_patent_preview(source_pdf, image_path):
                image_url = f"assets/patents/{patent_id}.png"

        if scholar_id not in scholars:
            color = COLORS[len(scholars) % len(COLORS)]
            scholars[scholar_id] = {
                "id": scholar_id,
                "name": display_name(raw_name),
                "sourceName": raw_name,
                "email": text_attr(cityu_author, "email") if cityu_author is not None else "",
                "auId": au_id,
                "profileUrl": f"https://scholars.cityu.edu.hk/en/persons/{au_id}/" if au_id else "",
                "affiliation": dept or "City University of Hong Kong",
                "affiliationTier": "top_university",
                "expertise": [],
                "patentIds": [],
                "avatar": avatar_data_url(raw_name, dept or "CityUHK", color),
                "paperBackground": [],
            }

        keywords = []
        for source in [title, summary, text_attr(pub, "patent_main_category_no"), text_attr(pub, "patent_category_no")]:
            for token in re.split(r"[\s,;，。、/()]+", source):
                token = token.strip()
                if 2 <= len(token) <= 32 and token.lower() not in {"the", "and", "for", "with", "method", "system"}:
                    keywords.append(token)
        keywords = list(dict.fromkeys(inferred_keywords + keywords))[:12]
        scholars[scholar_id]["patentIds"].append(patent_id)
        for item in keywords[:4]:
            if item not in scholars[scholar_id]["expertise"]:
                scholars[scholar_id]["expertise"].append(item)

        legal = text_attr(pub, "legal_status_info") or text_attr(pub, "publish_state") or text_attr(pub, "patent_validity")
        fulltext = text_attr(pub, "fulltext_url")
        pdf_url = local_original or fulltext or text_attr(pub, "source_url")
        commercial_fit = "trial" if seq in {"1", "2"} else ("high" if "Published" in text_attr(pub, "publish_state") or "授权" in text_attr(pub, "legal_status_original") else "standard")

        patents.append({
            "sourceName": "CityUHK Scholars",
            "publicationNumber": patent_id,
            "sourceUrl": text_attr(pub, "source_url"),
            "statusNote": "CityUHK Scholars public patent metadata. Legal status, claim scope, ownership and commercialization readiness require professional verification.",
            "sourceCaveat": "CityUHK Scholars public metadata; this prototype does not constitute legal licensing advice.",
            "type": "Design patent" if patent_id.startswith("USD") else "发明专利",
            "patentRules": build_patent_rules(patent_id),
            "trialAccess": seq in {"1", "2"},
            "id": patent_id,
            "title": title,
            "inventorId": scholar_id,
            "imageUrl": image_url,
            "pdfUrl": pdf_url,
            "localOriginal": local_original,
            "inventors": [display_name(text_attr(author, "au")) for author in author_nodes],
            "leadInventor": scholars[scholar_id]["name"],
            "assignee": text_attr(pub, "affiliation") or text_attr(pub, "organization") or "City University of Hong Kong",
            "applicationNumber": text_attr(pub, "patent_no") or text_attr(pub, "patent_reg_no"),
            "priorityDate": text_attr(pub, "patent_priority"),
            "filingDate": text_attr(pub, "accept_date") or text_attr(pub, "effective_start_date"),
            "publicationDate": text_attr(pub, "patent_issue_date") or text_attr(pub, "pubtime") or text_attr(pub, "pubyear"),
            "legalStatus": legal,
            "field": field,
            "industry": industry,
            "commercialFit": commercial_fit,
            "summary": summary,
            "keywords": keywords,
            "tags": [field, industry],
            "risks": [
                "需要核验专利权属、法律状态和许可边界",
                "需要结合企业数据、设备接口和试点预算评估落地可行性",
            ],
            "cityuScholar": {
                "name": scholars[scholar_id]["name"],
                "email": scholars[scholar_id]["email"],
                "auId": au_id,
                "department": dept,
            },
        })

    for scholar in scholars.values():
        seed_profile = (seed_data.get("profiles") or {}).get(scholar["id"], {})
        profile_urls = []
        if scholar.get("profileUrl"):
            profile_urls.append(scholar["profileUrl"])
        profile_urls.extend(seed_profile.get("profileUrls") or [])
        scholar["profileUrls"] = list(dict.fromkeys(profile_urls))
        if seed_profile.get("googleScholarUrl"):
            scholar["googleScholarUrl"] = seed_profile["googleScholarUrl"]
        scholar["expertise"] = scholar["expertise"][:8] or ["CityUHK patent commercialization", "technology transfer"]
        curated = curated_papers_for_scholar(seed_data, scholar)
        scraped = scrape_profile_papers(scholar)
        papers = merge_paper_records(curated, scraped, scholar)
        if not papers:
            papers = [{
                "title": f"CityUHK Scholars public profile for {scholar['name']}",
                "authors": [scholar["name"]],
                "year": "",
                "sourceUrl": scholar.get("profileUrl") or "",
                "description": "No downloadable paper metadata was found during local preparation.",
                "confidence": "low",
                "topicTags": [],
                "downloadStatus": "metadata_only",
                "note": "No downloadable paper metadata was found during local preparation.",
            }]
        scholar["identityRules"] = GLOBAL_IDENTITY_RULES
        scholar["evidenceRules"] = GLOBAL_EVIDENCE_RULES
        scholar["scholarRules"] = build_scholar_rules(scholar)
        scholar["patentRules"] = GLOBAL_PATENT_RULES
        scholar["rules"] = {
            "identityRules": scholar["identityRules"],
            "evidenceRules": scholar["evidenceRules"],
            "scholarRules": scholar["scholarRules"],
            "patentRules": scholar["patentRules"],
        }
        scholar["skills"] = DIGITAL_SCHOLAR_SKILLS
        scholar["sessionContext"] = build_session_context_policy()
        scholar["paperBackground"] = papers
        scholar["paperMemory"] = build_paper_memory(papers, scholar)
        scholar["knowledgeIndex"] = build_knowledge_index(scholar, papers)
        scholar["patentMemory"] = [
            {
                "id": patent["id"],
                "publicationNumber": patent.get("publicationNumber") or patent["id"],
                "title": patent.get("title") or "",
                "field": patent.get("field") or "",
                "industry": patent.get("industry") or "",
                "summary": patent.get("summary") or "",
                "sourceUrl": patent.get("sourceUrl") or "",
                "sourceType": "patent",
                "legalStatus": patent.get("legalStatus") or "",
            }
            for patent in patents
            if patent.get("inventorId") == scholar["id"]
        ]
        paper_dir = SCHOLAR_ASSET_DIR / scholar["id"] / "papers"
        paper_dir.mkdir(parents=True, exist_ok=True)
        (paper_dir / "manifest.json").write_text(json.dumps({
            "scholarId": scholar["id"],
            "scholarName": scholar["name"],
            "profileUrls": scholar.get("profileUrls") or [],
            "googleScholarUrl": scholar.get("googleScholarUrl") or "",
            "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "rules": scholar["rules"],
            "skills": scholar["skills"],
            "knowledgeIndex": scholar["knowledgeIndex"]["path"],
            "papers": papers,
        }, ensure_ascii=False, indent=2), encoding="utf-8")

    return list(scholars.values()), patents


def replace_main_data(inventors: list[dict], patents: list[dict]) -> None:
    source = MAIN_JS.read_text(encoding="utf-8")
    marker = "function derivePatentPricing(patent) {"
    start = source.index("// 发明人数据")
    end = source.index(marker)
    data_block = (
        "// 发明人数据\n"
        "const inventors = "
        + json.dumps(inventors, ensure_ascii=False, indent=4)
        + ";\n\n"
        + "const patents = "
        + json.dumps(patents, ensure_ascii=False, indent=4)
        + ";\n\n"
    )
    MAIN_JS.write_text(source[:start] + data_block + source[end:], encoding="utf-8")


def main() -> int:
    xml_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_XML
    if not xml_path.exists():
        print(f"XML not found: {xml_path}", file=sys.stderr)
        return 1
    PATENT_ASSET_DIR.mkdir(parents=True, exist_ok=True)
    SCHOLAR_ASSET_DIR.mkdir(parents=True, exist_ok=True)
    inventors, patents = build_catalog(xml_path)
    replace_main_data(inventors, patents)
    (ROOT / "assets" / "cityu-catalog-manifest.json").write_text(json.dumps({
        "sourceXml": str(xml_path),
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "inventorCount": len(inventors),
        "patentCount": len(patents),
        "patents": [{"id": patent["id"], "title": patent["title"], "inventorId": patent["inventorId"], "imageUrl": patent["imageUrl"], "localOriginal": patent["localOriginal"]} for patent in patents],
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Generated {len(patents)} patents and {len(inventors)} scholars")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
