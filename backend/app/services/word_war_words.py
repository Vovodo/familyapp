"""
Kelime Savaşı sözlüğü ve zincir doğrulaması.

Havuz, çizim oyunundaki tek kelimelik isimlerin üzerine yaygın Türkçe
kelimeler ve şehirler eklenerek kurulur. Doğrulama sunucuda yapılır.
"""
import random
from typing import Dict, Iterable, Optional, Set, Tuple

from backend.app.services.drawing_words import WORD_POOL

TR_LETTERS = set("abcçdefgğhıijklmnoöprsştuüvyz")

_SOFT_START = {"ğ": "g"}

CATEGORY_LABELS = {
    "hayvan": "Hayvan",
    "yemek": "Yemek",
    "sehir": "Şehir",
    "esya": "Eşya",
}

CITIES = [
    "adana", "adıyaman", "afyon", "ağrı", "aksaray", "amasya", "ankara", "antalya",
    "ardahan", "artvin", "aydın", "balıkesir", "bartın", "batman", "bayburt", "bilecik",
    "bingöl", "bitlis", "bolu", "burdur", "bursa", "çanakkale", "çankırı", "çorum",
    "denizli", "diyarbakır", "düzce", "edirne", "elazığ", "erzincan", "erzurum", "eskişehir",
    "gaziantep", "giresun", "gümüşhane", "hakkari", "hatay", "iğdır", "ısparta", "istanbul",
    "izmir", "kahramanmaraş", "karabük", "karaman", "kars", "kastamonu", "kayseri", "kırıkkale",
    "kırklareli", "kırşehir", "kilis", "kocaeli", "konya", "kütahya", "malatya", "manisa",
    "mardin", "mersin", "muğla", "muş", "nevşehir", "niğde", "ordu", "osmaniye",
    "rize", "sakarya", "samsun", "siirt", "sinop", "sivas", "şanlıurfa", "şırnak",
    "tekirdağ", "tokat", "trabzon", "tunceli", "uşak", "van", "yalova", "yozgat", "zonguldak",
    "bodrum", "alanya", "fethiye", "çeşme", "kuşadası", "pamukkale", "kapadokya", "sapanca",
]

EXTRA_WORDS = [
    "açık", "ağaç", "ağır", "aile", "akıl", "akşam", "alan", "alev", "amaç", "anlam",
    "anne", "araba", "arkadaş", "armut", "ateş", "ayakkabı", "ayna", "ayva", "bahar", "balık",
    "balkon", "banyo", "bardak", "başarı", "bebek", "beden", "beklemek", "belki", "biber", "bilgi",
    "birlik", "bomba", "bulut", "burun", "buzdolabı", "cadde", "cam", "can", "cevap", "cümle",
    "çanta", "çalışma", "çekirdek", "çikolata", "çilek", "çocuk", "çorba", "dağ", "dakika", "dalga",
    "damla", "deniz", "dere", "destek", "devam", "dikkat", "dilim", "direk", "doğru", "doktor",
    "dolap", "dost", "duvar", "dünya", "düşünce", "elbise", "elma", "emek", "enerji", "evrak",
    "fener", "fikir", "filiz", "fırın", "fırtına", "futbol", "güneş", "güven", "haber", "hazine",
    "hayal", "hayat", "hedef", "hikaye", "huzur", "ışık", "ılık", "ıslak", "ıspanak", "ızgara",
    "içecek", "iğne", "iklim", "imza", "inek", "internet", "iskele", "istasyon", "işlek", "üzüm",
    "jandarma", "jeton", "jilet", "joker", "jüt",
    "kahve", "kalem", "kapı", "kardeş", "kavun", "kaynak", "kelebek", "kemik", "kent", "kilit",
    "kitap", "koltuk", "komşu", "korku", "köprü", "kulak", "kutu", "kültür", "lamba", "lezzet",
    "limon", "lise", "lokanta", "macera", "makas", "masa", "mavı", "mavi", "merdiven", "meyve",
    "mikrofon", "minik", "mutfak", "müzik", "nane", "nefes", "nehir", "nokta", "numara", "ocak",
    "odun", "okul", "orman", "oyun", "öğle", "öğrenci", "ölçü", "örnek", "özgür", "öykü",
    "paket", "pazar", "pencere", "pilav", "pırasa", "posta", "radyo", "rahat", "renk", "resim",
    "rüzgar", "sabah", "sahil", "salata", "sandalye", "saray", "savaş", "sebze", "selam", "sıcak",
    "simit", "soğuk", "sokak", "soru", "sözlük", "suç", "süre", "şarkı", "şehre", "şehir",
    "şeker", "şemsiye", "şimşek", "şişe", "tabak", "tahta", "takım", "tamir", "tavan", "tehlike",
    "telefon", "temiz", "tepe", "trafik", "turşu", "tuzlu", "uçak", "umut", "usta", "uyanık",
    "üzgün", "vagon", "vakit", "valiz", "vapur", "varil", "vedalaşma", "vergi", "villa", "vücut",
    "yağmur", "yakın", "yalın", "yanıt", "yapı", "yarış", "yazlık", "yemek", "yıldız", "yoğurt",
    "yolculuk", "yürek", "zaman", "zarf", "zevk", "zil", "ziyaret", "zorluk",
    "ılıkçay", "ırak", "ıslık", "ıtır",
    "ğ"  # placeholder filtered
]


def turkish_lower(text: str) -> str:
    if not text:
        return ""
    out = []
    for ch in text:
        if ch == "I":
            out.append("ı")
        elif ch == "İ":
            out.append("i")
        else:
            out.append(ch.lower())
    return "".join(out)


def normalize_word(text: str) -> str:
    lowered = turkish_lower((text or "").strip())
    return "".join(ch for ch in lowered if ch in TR_LETTERS)


def is_single_token(word: str) -> bool:
    return bool(word) and " " not in word and "-" not in word


def _tokens_from_pool(keys: Iterable[str]) -> Set[str]:
    words: Set[str] = set()
    for key in keys:
        for raw in WORD_POOL.get(key, []):
            token = normalize_word(raw)
            if len(token) >= 2 and is_single_token(raw.strip()):
                words.add(token)
    return words


def chain_letter(word: str) -> str:
    """Sonraki kelimenin başlaması gereken harf. Ğ ile bitenlerde g kabul edilir."""
    if not word:
        return "a"
    last = word[-1]
    return _SOFT_START.get(last, last)


def starts_with_required(word: str, required: str) -> bool:
    if not word or not required:
        return False
    first = word[0]
    need = turkish_lower(required)[:1]
    if first == need:
        return True
    if need == "g" and first == "ğ":
        return True
    if need == "ğ" and first == "g":
        return True
    return False


CATEGORY_WORDS: Dict[str, Set[str]] = {
    "hayvan": _tokens_from_pool(["hayvanlar"]),
    "yemek": _tokens_from_pool(["yemek_icecek", "meyve_sebze"]),
    "sehir": {normalize_word(c) for c in CITIES if len(normalize_word(c)) >= 2},
    "esya": _tokens_from_pool(["ev_esyalari", "giyim"]),
}

DICTIONARY: Set[str] = set()
for _words in CATEGORY_WORDS.values():
    DICTIONARY.update(_words)
DICTIONARY.update(_tokens_from_pool(WORD_POOL.keys()))
DICTIONARY.update(
    normalize_word(w) for w in EXTRA_WORDS if len(normalize_word(w)) >= 2
)
DICTIONARY.discard("ğ")

# Zincirin kopmaması için her harften en az bir kelime olsun.
_STARTERS = {
    "a": ["araba", "aslan", "anne", "anka", "ayva"],
    "b": ["balık", "bebek", "bardak", "bulut"],
    "c": ["cam", "ceviz", "cadde"],
    "ç": ["çilek", "çorba", "çanta", "çocuk"],
    "d": ["deniz", "dalga", "dolap", "dünya"],
    "e": ["elma", "evrak", "ekmek", "etek"],
    "f": ["fener", "fırın", "futbol"],
    "g": ["güneş", "gemi", "gözlük", "gül"],
    "h": ["halı", "hava", "helva"],
    "ı": ["ıspanak", "ıslak", "ılık", "ışık", "ıslık"],
    "i": ["inek", "iğne", "istanbul", "iskele"],
    "j": ["jeton", "jilet", "jandarma"],
    "k": ["kedi", "kitap", "kapı", "kalem"],
    "l": ["limon", "lamba", "lokum"],
    "m": ["masa", "muz", "mutfak", "mavi"],
    "n": ["nane", "nehir", "nokta"],
    "o": ["ocak", "okul", "orman", "oyun"],
    "ö": ["ördek", "örnek", "öğrenci", "öykü"],
    "p": ["peynir", "pilav", "pencere"],
    "r": ["radyo", "resim", "rüzgar"],
    "s": ["simit", "sandalye", "su", "sabah"],
    "ş": ["şehir", "şeker", "şarkı", "şemsiye"],
    "t": ["top", "tabak", "telefon", "tavuk"],
    "u": ["uçak", "umut", "uzay"],
    "ü": ["üzüm", "ütü", "üniforma"],
    "v": ["vazo", "vapur", "valiz"],
    "y": ["yemek", "yıldız", "yağmur", "yoğurt"],
    "z": ["zeytin", "zil", "zaman"],
}
for _group in _STARTERS.values():
    DICTIONARY.update(normalize_word(w) for w in _group if len(normalize_word(w)) >= 2)

# "su" 2 harf; izin ver.
DICTIONARY = {w for w in DICTIONARY if len(w) >= 2}


def pick_start_word(avoid: Optional[Set[str]] = None) -> str:
    avoid = avoid or set()
    pool = [w for w in DICTIONARY if 4 <= len(w) <= 8 and w not in avoid]
    if not pool:
        pool = list(DICTIONARY)
    return random.choice(pool)


def pick_category(required_letter: Optional[str] = None) -> Tuple[str, str]:
    keys = list(CATEGORY_LABELS.keys())
    if required_letter:
        matching = [
            key
            for key, words in CATEGORY_WORDS.items()
            if any(starts_with_required(w, required_letter) for w in words)
        ]
        if matching:
            keys = matching
    key = random.choice(keys)
    return key, CATEGORY_LABELS[key]


def validate_word(
    raw: str,
    required_letter: str,
    used: Set[str],
    category_key: Optional[str] = None,
) -> Tuple[Optional[str], Optional[str]]:
    """
    Returns (normalized_word, error_code).
    error_code: empty | letters | short | unknown | letter | used | category
    """
    token = normalize_word(raw)
    if not token:
        return None, "empty"
    if any(ch not in TR_LETTERS for ch in token):
        return None, "letters"
    if len(token) < 2:
        return None, "short"
    if len(token) > 24:
        return None, "letters"
    if not starts_with_required(token, required_letter):
        return None, "letter"
    if token in used:
        return None, "used"
    if category_key:
        cat = CATEGORY_WORDS.get(category_key) or set()
        if token not in cat:
            return None, "category"
    elif token not in DICTIONARY:
        return None, "unknown"
    return token, None
