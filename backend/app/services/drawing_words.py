"""
Çiz ve Tahmin Et oyununun kelime havuzu ve oyuncu bazlı kelime dağıtımı.

Havuz kategori bazlı tutulur; yeni kategori veya kelime eklemek için sadece
WORD_POOL sözlüğünü genişletmek yeterlidir. Kelime dağıtımı oyuncu bazlı
geçmişe bakar: bir oyuncuya gösterilmiş kelimeler, havuzun geri kalanı
tükenmeden tekrar gösterilmez.
"""
import random
from typing import Dict, List, Optional, Sequence

from sqlalchemy.orm import Session
from loguru import logger


# Zorluk, kelimenin kaç kelimeden oluştuğu ve soyutluğuna göre değil,
# kategorinin genel çizilebilirliğine göre gruplanmıştır.
WORD_POOL: Dict[str, List[str]] = {
    "hayvanlar": [
        "kedi", "köpek", "at", "inek", "koyun", "keçi", "tavuk", "horoz", "civciv", "ördek",
        "kaz", "hindi", "kuzu", "buzağı", "eşek", "katır", "deve", "lama", "zürafa", "fil",
        "aslan", "kaplan", "leopar", "çita", "ayı", "panda", "koala", "kanguru", "maymun", "goril",
        "zebra", "su aygırı", "gergedan", "geyik", "karaca", "tavşan", "sincap", "kirpi", "köstebek", "fare",
        "sıçan", "gelincik", "tilki", "kurt", "çakal", "yarasa", "baykuş", "kartal", "şahin", "atmaca",
        "güvercin", "serçe", "kanarya", "papağan", "leylek", "flamingo", "pelikan", "penguen", "martı", "kuğu",
        "balık", "köpek balığı", "yunus", "balina", "vatoz", "ahtapot", "kalamar", "denizyıldızı", "denizatı", "yengeç",
        "karides", "istakoz", "midye", "salyangoz", "solucan", "kelebek", "tırtıl", "arı", "yusufçuk", "karınca",
        "çekirge", "cırcır böceği", "uğur böceği", "hamam böceği", "örümcek", "akrep", "yılan", "kertenkele", "bukalemun", "iguana",
        "timsah", "kaplumbağa", "kurbağa", "semender", "deniz kaplumbağası", "kirpi balığı", "kılıç balığı", "vaşak", "porsuk", "su samuru",
    ],
    "meyve_sebze": [
        "elma", "armut", "muz", "portakal", "mandalina", "limon", "greyfurt", "üzüm", "karpuz", "kavun",
        "çilek", "kiraz", "vişne", "şeftali", "kayısı", "erik", "nar", "incir", "ayva", "dut",
        "ananas", "mango", "avokado", "kivi", "hindistan cevizi", "böğürtlen", "ahududu", "yaban mersini", "hurma", "zeytin",
        "domates", "salatalık", "biber", "patlıcan", "kabak", "havuç", "patates", "soğan", "sarımsak", "pırasa",
        "lahana", "karnabahar", "brokoli", "marul", "ıspanak", "maydanoz", "dereotu", "nane", "roka", "turp",
        "pancar", "bezelye", "fasulye", "mısır", "bamya", "enginar", "kereviz", "şalgam", "mantar", "kestane",
    ],
    "yemek_icecek": [
        "ekmek", "simit", "poğaça", "börek", "pide", "lahmacun", "pizza", "hamburger", "sandviç", "tost",
        "makarna", "pilav", "çorba", "kebap", "köfte", "döner", "mantı", "dolma", "sarma", "menemen",
        "omlet", "yumurta", "peynir", "zeytinyağı", "tereyağı", "reçel", "bal", "pekmez", "tahin", "helva",
        "baklava", "künefe", "lokma", "tulumba", "kadayıf", "dondurma", "pasta", "kek", "kurabiye", "çikolata",
        "şeker", "lokum", "pamuk şeker", "waffle", "krep", "muffin", "puding", "sütlaç", "kazandibi", "profiterol",
        "çay", "kahve", "türk kahvesi", "süt", "ayran", "limonata", "meyve suyu", "kola", "gazoz", "soda",
        "şerbet", "salep", "boza", "smoothie", "milkshake", "buzlu çay", "sıcak çikolata", "bardak su", "kola kutusu", "çaydanlık",
    ],
    "ev_esyalari": [
        "masa", "sandalye", "koltuk", "kanepe", "sehpa", "yatak", "yastık", "yorgan", "çarşaf", "battaniye",
        "dolap", "gardırop", "raf", "kitaplık", "ayna", "halı", "kilim", "perde", "abajur", "avize",
        "lamba", "mum", "şamdan", "vazo", "saksı", "tablo", "çerçeve", "saat", "duvar saati", "çalar saat",
        "televizyon", "kumanda", "buzdolabı", "fırın", "ocak", "mikrodalga", "bulaşık makinesi", "çamaşır makinesi", "ütü", "süpürge",
        "paspas", "kova", "fırça", "tabak", "kase", "bardak", "fincan", "kupa", "çatal", "kaşık",
        "bıçak", "tencere", "tava", "kepçe", "spatula", "rende", "cezve", "tepsi", "kesme tahtası", "havlu",
        "sabun", "şampuan", "diş fırçası", "diş macunu", "tarak", "makas", "jilet", "banyo küveti", "duş", "lavabo",
        "musluk", "tuvalet", "çöp kovası", "kapı", "pencere", "anahtar", "kilit", "merdiven", "priz", "ampul",
    ],
    "giyim": [
        "tişört", "gömlek", "kazak", "hırka", "ceket", "mont", "kaban", "yelek", "pantolon", "kot pantolon",
        "şort", "etek", "elbise", "tulum", "pijama", "bornoz", "çorap", "külotlu çorap", "ayakkabı", "spor ayakkabı",
        "bot", "çizme", "terlik", "sandalet", "topuklu ayakkabı", "şapka", "bere", "kasket", "atkı", "eldiven",
        "kemer", "kravat", "papyon", "fular", "gözlük", "güneş gözlüğü", "saat kordonu", "yüzük", "kolye", "küpe",
        "bilezik", "broş", "çanta", "sırt çantası", "cüzdan", "valiz", "şemsiye", "maske", "önlük", "mayo",
    ],
    "doga": [
        "ağaç", "çam ağacı", "palmiye", "kaktüs", "çiçek", "gül", "papatya", "lale", "menekşe", "orkide",
        "ayçiçeği", "karanfil", "yonca", "yaprak", "dal", "kök", "tohum", "çimen", "çalı", "orman",
        "dağ", "tepe", "vadi", "kanyon", "mağara", "çöl", "vaha", "ova", "yanardağ", "kaya",
        "taş", "kum", "toprak", "nehir", "dere", "şelale", "göl", "deniz", "okyanus", "ada",
        "plaj", "kumsal", "buzdağı", "kar", "kar tanesi", "kardan adam", "yağmur", "gökkuşağı", "bulut", "şimşek",
        "güneş", "ay", "yıldız", "gezegen", "dünya", "satürn", "kuyruklu yıldız", "gökyüzü", "rüzgar", "gün batımı",
    ],
    "ulasim": [
        "araba", "otobüs", "minibüs", "kamyon", "traktör", "tır", "taksi", "ambulans", "itfaiye aracı", "polis arabası",
        "motosiklet", "bisiklet", "scooter", "kaykay", "paten", "tekerlekli sandalye", "bebek arabası", "tren", "metro", "tramvay",
        "teleferik", "vapur", "gemi", "yelkenli", "kayık", "kano", "sal", "denizaltı", "uçak", "helikopter",
        "balon", "planör", "paraşüt", "roket", "uzay mekiği", "at arabası", "kızak", "vinç", "iş makinesi", "yol",
        "köprü", "tünel", "trafik ışığı", "durak", "istasyon", "havalimanı", "liman", "garaj", "benzin istasyonu", "direksiyon",
    ],
    "meslekler": [
        "doktor", "hemşire", "diş hekimi", "veteriner", "öğretmen", "öğrenci", "aşçı", "garson", "fırıncı", "kasap",
        "berber", "kuaför", "terzi", "ayakkabıcı", "marangoz", "demirci", "kaynakçı", "elektrikçi", "tesisatçı", "boyacı",
        "inşaat işçisi", "mimar", "mühendis", "pilot", "kaptan", "şoför", "postacı", "polis", "itfaiyeci", "asker",
        "bekçi", "çiftçi", "çoban", "balıkçı", "arıcı", "bahçıvan", "madenci", "ressam", "heykeltıraş", "müzisyen",
        "şarkıcı", "dansçı", "oyuncu", "palyaço", "sihirbaz", "cambaz", "gazeteci", "fotoğrafçı", "yazar", "bilim insanı",
        "astronot", "dalgıç", "hakim", "avukat", "eczacı", "kütüphaneci", "hakem", "antrenör", "kaleci", "manav",
    ],
    "vucut_saglik": [
        "el", "ayak", "parmak", "kol", "bacak", "diz", "dirsek", "omuz", "boyun", "kafa",
        "saç", "göz", "kaş", "kirpik", "kulak", "burun", "ağız", "dudak", "diş", "dil",
        "yüz", "alın", "çene", "sakal", "bıyık", "kalp", "beyin", "kemik", "iskelet", "kas",
        "gözlük", "işitme cihazı", "protez", "alçı", "bandaj", "yara bandı", "iğne", "şırınga", "ilaç", "hap",
        "termometre", "stetoskop", "sedye", "hastane", "eczane", "ateş ölçer", "tansiyon aleti", "maskeli doktor", "röntgen", "aşı",
    ],
    "spor_oyun": [
        "futbol", "basketbol", "voleybol", "tenis", "masa tenisi", "badminton", "hentbol", "beyzbol", "golf", "boks",
        "güreş", "judo", "karate", "tekvando", "eskrim", "okçuluk", "atletizm", "maraton", "yüzme", "dalış",
        "sörf", "kayak", "snowboard", "buz pateni", "bisiklet yarışı", "binicilik", "jimnastik", "halter", "yoga", "pilates",
        "top", "kale", "file", "raket", "sopa", "kask", "eldiven", "düdük", "kupa", "madalya",
        "satranç", "dama", "tavla", "domino", "iskambil", "puzzle", "zar", "bilye", "yoyo", "uçurtma",
        "salıncak", "kaydırak", "tahterevalli", "trambolin", "hula hoop", "ip atlama", "körebe", "saklambaç", "seksek", "misket",
    ],
    "muzik_sanat": [
        "gitar", "bağlama", "ud", "keman", "viyolonsel", "piyano", "org", "akordeon", "flüt", "ney",
        "klarnet", "trompet", "saksafon", "trombon", "davul", "darbuka", "def", "zil", "ksilofon", "arp",
        "mikrofon", "hoparlör", "kulaklık", "radyo", "plak", "kaset", "nota", "anahtar deliği", "müzik kutusu", "metronom",
        "fırça", "boya", "palet", "tuval", "şövale", "kalem", "kurşun kalem", "renkli kalem", "pastel", "silgi",
        "kalemtıraş", "cetvel", "pergel", "gönye", "makas", "yapıştırıcı", "kil", "hamur", "maske", "tiyatro",
    ],
    "okul_ofis": [
        "okul", "sınıf", "tahta", "tebeşir", "sıra", "defter", "kitap", "sözlük", "harita", "küre",
        "çanta", "kalem kutusu", "dosya", "klasör", "zımba", "ataş", "raptiye", "delgeç", "kağıt", "zarf",
        "pul", "damga", "mektup", "kartpostal", "gazete", "dergi", "afiş", "pano", "zil", "diploma",
        "hesap makinesi", "abaküs", "mikroskop", "teleskop", "deney tüpü", "büyüteç", "pusula", "mezura", "terazi", "kronometre",
    ],
    "teknoloji": [
        "bilgisayar", "dizüstü bilgisayar", "tablet", "telefon", "akıllı telefon", "klavye", "fare", "ekran", "yazıcı", "tarayıcı",
        "kamera", "fotoğraf makinesi", "video kamera", "projeksiyon", "dron", "robot", "pil", "şarj aleti", "kablo", "usb bellek",
        "hard disk", "cd", "anten", "uydu", "modem", "vantilatör", "klima", "ısıtıcı", "su ısıtıcısı", "blender",
        "mikser", "tost makinesi", "kahve makinesi", "saç kurutma makinesi", "el feneri", "megafon", "alarm", "sensör", "sayaç", "jeneratör",
    ],
    "yapilar_sehir": [
        "ev", "apartman", "villa", "gökdelen", "kulübe", "çadır", "saray", "kale", "kule", "kilise",
        "cami", "minare", "sinagog", "tapınak", "piramit", "obelisk", "heykel", "çeşme", "havuz", "bahçe",
        "park", "bank", "çit", "duvar", "baca", "çatı", "balkon", "asansör", "yürüyen merdiven", "kaldırım",
        "sokak lambası", "levha", "bayrak", "posta kutusu", "telefon kulübesi", "büfe", "market", "mağaza", "restoran", "kafe",
        "otel", "müze", "kütüphane", "sinema", "stadyum", "hastane binası", "fabrika", "değirmen", "ahır", "kuyu",
        "deniz feneri", "iskele", "barış köprüsü", "tren rayı", "tel örgü", "dikilitaş", "amfi tiyatro", "su kemeri", "han", "hamam",
    ],
    "kutlama_kavramlar": [
        "doğum günü", "pasta mumu", "hediye", "balon", "konfeti", "havai fişek", "parti şapkası", "davetiye", "kurdele", "fiyonk",
        "düğün", "gelinlik", "nikah yüzüğü", "bayram", "şeker kutusu", "yeni yıl", "noel ağacı", "çelenk", "kalp", "aşk mektubu",
        "gülen yüz", "üzgün yüz", "şaşkın yüz", "uyku", "rüya", "düşünce balonu", "soru işareti", "ünlem", "ampul fikri", "alkış",
        "el sıkışma", "sarılma", "öpücük", "selam", "başparmak", "barış işareti", "zafer", "kutlama", "kalabalık", "aile",
        "arkadaşlık", "yardım", "paylaşma", "sır", "sürpriz", "yarış", "kazanmak", "kaybetmek", "beklemek", "koşmak",
        "zıplamak", "yüzmek", "uçmak", "düşmek", "tırmanmak", "gülmek", "ağlamak", "bağırmak", "fısıldamak", "dinlemek",
    ],
    "masal_fantastik": [
        "ejderha", "tek boynuzlu at", "peri", "cadı", "cin", "dev", "cüce", "kral", "kraliçe", "prens",
        "prenses", "şövalye", "kılıç", "kalkan", "miğfer", "zırh", "taç", "asa", "sihirli değnek", "büyü kitabı",
        "kazan", "iksir", "hazine", "hazine sandığı", "harita parşömeni", "korsan", "korsan gemisi", "kanca", "papağanlı korsan", "denizkızı",
        "hayalet", "vampir", "kurt adam", "zombi", "mumya", "iskelet korsan", "canavar", "uzaylı", "ufo", "süper kahraman",
        "pelerin", "maskeli kahraman", "robot dostu", "zaman makinesi", "büyülü ayna", "uçan halı", "sihirli lamba", "fasulye sırığı", "altın yumurta", "konuşan kurbağa",
    ],
    "aletler_diger": [
        "çekiç", "tornavida", "pense", "anahtar takımı", "matkap", "testere", "balta", "keser", "çivi", "vida",
        "somun", "cıvata", "mala", "kürek", "kazma", "tırmık", "orak", "tırpan", "bahçe makası", "hortum",
        "sulama kabı", "el arabası", "merdiven basamağı", "kanca", "zincir", "halat", "ip", "makara", "kaldıraç", "dişli",
        "pusula aleti", "seviye", "şerit metre", "eldivenli el", "baret", "koruyucu gözlük", "yangın söndürücü", "ilk yardım çantası", "alet çantası", "işaret konisi",
        "para", "madeni para", "banknot", "kumbara", "kredi kartı", "fatura", "bilet", "pasaport", "kimlik", "damga mührü",
    ],
}


def get_all_words() -> List[str]:
    """Havuzdaki tüm kelimeleri tek listede, tekrarsız döndürür."""
    seen = set()
    words: List[str] = []
    for category_words in WORD_POOL.values():
        for word in category_words:
            normalized = word.strip()
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            words.append(normalized)
    return words


ALL_WORDS: List[str] = get_all_words()
POOL_SIZE: int = len(ALL_WORDS)


def get_word_category(word: str) -> Optional[str]:
    """Kelimenin ait olduğu kategoriyi döndürür (ipucu göstermek için)."""
    target = (word or "").strip().lower()
    for category, category_words in WORD_POOL.items():
        if any(w.lower() == target for w in category_words):
            return category
    return None


def normalize_guess(text: str) -> str:
    """
    Tahmin karşılaştırması için metni sadeleştirir.
    Türkçe karakterler korunur; sadece boşluk, noktalama ve büyük/küçük harf
    farkları temizlenir ki 'Kar Tanesi!' ile 'kar tanesi' eşleşsin.
    """
    if not text:
        return ""
    lowered = text.strip().lower()
    # Türkçe'de 'I'.lower() -> 'i' dönüşümü sorun çıkarabildiği için
    # yalnızca harf ve rakamları tutup aradaki boşlukları teke indiriyoruz.
    cleaned = "".join(ch if (ch.isalnum() or ch.isspace()) else " " for ch in lowered)
    return " ".join(cleaned.split())


def mask_word(word: str) -> str:
    """
    Tahmin edenlere gösterilecek maske: harf sayısı görünür, harfler gizli.
    Örn: 'kar tanesi' -> '_ _ _   _ _ _ _ _ _'
    """
    if not word:
        return ""
    parts = []
    for chunk in word.split():
        parts.append(" ".join("_" * len(chunk)))
    return "   ".join(parts)


def pick_word_for_user(
    shown_words: Sequence[str],
    pool: Optional[Sequence[str]] = None,
    avoid: Optional[Sequence[str]] = None,
) -> tuple[str, bool]:
    """
    Bir oyuncu için sıradaki kelimeyi seçer.

    Seçim tamamen rastgele değil: önce oyuncuya *hiç gösterilmemiş* kelimeler
    kümesi çıkarılır, kelime yalnızca o kümeden seçilir. Böylece havuz
    tükenmeden hiçbir kelime tekrar etmez, ama sıra da deterministik olmaz.

    Havuz tükendiğinde döngü sıfırlanır; yeni döngünün ilk kelimesi
    `avoid` listesindeki (en son görülen) kelimelerden seçilmez, böylece
    döngü sınırında ard arda tekrar oluşmaz.

    Returns:
        (kelime, gecmis_sifirlandi_mi)
    """
    candidate_pool = list(pool) if pool is not None else list(ALL_WORDS)
    if not candidate_pool:
        raise ValueError("Kelime havuzu boş.")

    shown = {normalize_guess(w) for w in shown_words if w}
    unseen = [w for w in candidate_pool if normalize_guess(w) not in shown]

    if unseen:
        return random.choice(unseen), False

    # Havuz bu oyuncu için tamamen tükendi: yeni döngü başlat.
    avoid_set = {normalize_guess(w) for w in (avoid or []) if w}
    fresh = [w for w in candidate_pool if normalize_guess(w) not in avoid_set]
    if not fresh:
        fresh = candidate_pool
    logger.info(f"Kelime havuzu bir oyuncu için tükendi, döngü sıfırlanıyor (havuz: {len(candidate_pool)}).")
    return random.choice(fresh), True
