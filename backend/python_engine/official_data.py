"""
Official Government & Public Services Registry and Detection for Python Reliability Engine.
"""

from datetime import datetime, timezone
import re

OFFICIAL_SERVICES = [
    {
        "id": "driving-licence",
        "matchTerms": [
            "driving license", "driving licence", "driving licenes", "driver license",
            "driver licence", "learner license", "learning licence", "learning license",
            "apply dl", "dl apply", "dl renewal", "parivahan", "sarathi", "sarathi parivahan",
            "rto", "driving test", "permanent license", "commercial driving license"
        ],
        "name": "Driving Licence (DL) Services",
        "portalName": "Parivahan Sewa — Ministry of Road Transport & Highways",
        "domain": "parivahan.gov.in",
        "url": "https://parivahan.gov.in/",
        "directServiceUrl": "https://sarathi.parivahan.gov.in/sarathiservice/stateSelection.do",
        "badge": "Official Government Portal",
        "authority": "Government of India (MoRTH)",
        "description": "Parivahan Sewa is the official portal of the Ministry of Road Transport and Highways (Govt. of India) for applying for a Learner's Licence (LL), Permanent Driving Licence (DL), DL Renewal, Duplicate DL, and checking application status online.",
        "directAnswer": "To obtain a Driving Licence in India, you must first apply for a Learner's Licence (LL) through the official Parivahan Sewa portal (parivahan.gov.in). After holding the Learner's Licence for at least 30 days, you can book a driving skill test slot at your local RTO to receive a Permanent Driving Licence.",
        "keyPoints": [
            "Eligibility: Age 18+ for light motor vehicles (cars/motorcycles with gear), age 16+ for motorcycles without gear (<50cc).",
            "Step 1: Visit parivahan.gov.in → Select 'Driving Licence Related Services' (Sarathi portal) → Select your State.",
            "Step 2: Choose 'Apply for Learner Licence (LL)' and complete authentication (via Aadhaar or without Aadhaar).",
            "Step 3: Upload required documents (Age Proof, Address Proof, Form 1 self-declaration of physical fitness).",
            "Step 4: Pay the application fee and take the online/RTO Learner's Test on road signs and traffic rules.",
            "Step 5: Hold LL for at least 30 days (valid for 6 months), then apply for 'Permanent Driving Licence' and pass the practical driving test."
        ],
        "relatedLinks": [
            {"title": "Sarathi Parivahan (State Selection & DL Services)", "url": "https://sarathi.parivahan.gov.in/"},
            {"title": "Track Application Status on Parivahan", "url": "https://sarathi.parivahan.gov.in/sarathiservice/applViewStatus.do"},
            {"title": "USA.gov Official Driver's License Guide", "url": "https://www.usa.gov/driver-license"},
            {"title": "UK GOV.UK Official Driving Licences", "url": "https://www.gov.uk/browse/driving/driving-licences"}
        ]
    },
    {
        "id": "passport",
        "matchTerms": [
            "passport", "passport apply", "apply passport", "passport seva",
            "passport renewal", "tatkaal passport", "passport appointment", "pcc"
        ],
        "name": "Passport Seva Portal",
        "portalName": "Passport Seva — Ministry of External Affairs",
        "domain": "passportindia.gov.in",
        "url": "https://passportindia.gov.in/",
        "directServiceUrl": "https://portal2.passportindia.gov.in/AppOnlineProject/welcomeLink",
        "badge": "Official Government Portal",
        "authority": "Government of India (MEA)",
        "description": "Passport Seva is the official portal of the Ministry of External Affairs for fresh passport applications, passport re-issue/renewal, police clearance certificates (PCC), and appointment scheduling at PSK/POPSK.",
        "directAnswer": "You can apply for a fresh passport or passport renewal online through the official Passport Seva portal (passportindia.gov.in). Register an account, fill out Application Form, pay fees online, and schedule an in-person appointment at your nearest Passport Seva Kendra (PSK).",
        "keyPoints": [
            "Register on the official Passport Seva Online Portal (passportindia.gov.in).",
            "Apply for 'Fresh Passport / Re-issue of Passport' and fill in personal and address details.",
            "Pay the applicable application fee and schedule an appointment at your preferred PSK/POPSK.",
            "Carry original documents (Proof of Date of Birth, Photo ID, Address Proof) for verification on appointment day.",
            "Police verification will follow, after which the passport is printed and dispatched via Speed Post."
        ],
        "relatedLinks": [
            {"title": "Track Passport Status Online", "url": "https://passportindia.gov.in/AppOnlineProject/statusTracker/trackStatusInpNew"},
            {"title": "Locate Nearest Passport Seva Kendra (PSK)", "url": "https://passportindia.gov.in/AppOnlineProject/locatePSK/locatePSKInp"}
        ]
    },
    {
        "id": "aadhaar",
        "matchTerms": [
            "aadhaar", "aadhar", "uidai", "myaadhaar", "download aadhaar",
            "update aadhaar", "aadhaar card", "pvc aadhaar", "aadhar card download"
        ],
        "name": "Aadhaar Services (UIDAI)",
        "portalName": "UIDAI — Unique Identification Authority of India",
        "domain": "uidai.gov.in",
        "url": "https://uidai.gov.in/",
        "directServiceUrl": "https://myaadhaar.uidai.gov.in/",
        "badge": "Official Government Portal",
        "authority": "Government of India (UIDAI)",
        "description": "Official portal of the Unique Identification Authority of India (UIDAI) for downloading digital e-Aadhaar, ordering Aadhaar PVC card, updating address/demographics, checking enrollment status, and biometrics security.",
        "directAnswer": "Aadhaar services can be accessed securely online at myaadhaar.uidai.gov.in or uidai.gov.in. Using your registered mobile number and OTP, you can download an official password-protected e-Aadhaar PDF, update your address, or order a durable PVC card.",
        "keyPoints": [
            "Download e-Aadhaar: Go to myaadhaar.uidai.gov.in → Click 'Download Aadhaar' → Enter 12-digit UID or 16-digit VID + OTP.",
            "PDF Password: First 4 letters of your name in CAPITAL followed by your Year of Birth (e.g. SURN1995).",
            "Address Update: Can be performed entirely online with valid proof of address document.",
            "Biometric Updates: Photo, iris, and fingerprint updates require visiting a nearby Aadhaar Seva Kendra."
        ],
        "relatedLinks": [
            {"title": "myAadhaar Direct Services Portal", "url": "https://myaadhaar.uidai.gov.in/"},
            {"title": "Locate an Aadhaar Seva Kendra", "url": "https://appointments.uidai.gov.in/easearch.aspx"}
        ]
    },
    {
        "id": "pan-card",
        "matchTerms": [
            "pan card", "pan apply", "apply pan", "nsdl pan", "uti pan",
            "pan card download", "e-pan", "pan status", "link pan aadhaar"
        ],
        "name": "PAN Card Services",
        "portalName": "Protean NSDL / UTIITSL — Income Tax PAN Services",
        "domain": "onlineservices.nsdl.com",
        "url": "https://www.onlineservices.nsdl.com/paam/endUserRegisterContact.html",
        "directServiceUrl": "https://www.tin-nsdl.com/",
        "badge": "Official Government Portal",
        "authority": "Income Tax Department (via NSDL/Protean)",
        "description": "Official designated portal for applying for a Permanent Account Number (PAN Card, Form 49A), PAN corrections, reprint of physical card, and instant e-PAN generation.",
        "directAnswer": "New PAN cards can be applied for online via the Protean NSDL (onlineservices.nsdl.com) or UTIITSL portals under Form 49A. If you have an Aadhaar-linked mobile number, you can also obtain an instant digital e-PAN free of cost on the Income Tax e-filing portal.",
        "keyPoints": [
            "Apply online on Protean NSDL or UTIITSL portal selecting Application Type 'New PAN - Indian Citizen (Form 49A)'.",
            "Provide identity proof, address proof, and date of birth proof (Aadhaar covers all three).",
            "For paperless e-KYC, authenticate using Aadhaar OTP; no physical document courier required.",
            "Standard fee: ~₹107 for physical delivery within India; digital e-PAN is delivered to your email."
        ],
        "relatedLinks": [
            {"title": "Track PAN Card Application Status", "url": "https://tin.tin.nsdl.com/pantan/StatusTrack.html"},
            {"title": "Instant e-PAN via Income Tax Portal", "url": "https://www.incometax.gov.in/iec/foportal/instant-e-pan"}
        ]
    },
    {
        "id": "income-tax",
        "matchTerms": [
            "income tax", "itr", "itr filing", "income tax return", "e-filing",
            "incometax", "tax refund status", "form 26as", "ais"
        ],
        "name": "Income Tax e-Filing Portal",
        "portalName": "Income Tax Department — Government of India",
        "domain": "incometax.gov.in",
        "url": "https://www.incometax.gov.in/iec/foportal/",
        "directServiceUrl": "https://www.incometax.gov.in/iec/foportal/",
        "badge": "Official Government Portal",
        "authority": "Ministry of Finance (CBDT)",
        "description": "Official e-Filing portal for filing annual Income Tax Returns (ITR-1 through 7), tracking income tax refund status, viewing Form 26AS/AIS, and submitting grievances.",
        "directAnswer": "Income tax returns must be filed electronically on the official Income Tax portal (incometax.gov.in). Log in with your PAN as your User ID to view pre-filled salary/interest data, calculate liability, submit your return, and e-verify using Aadhaar OTP.",
        "keyPoints": [
            "Portal login: User ID is your PAN number; password set during registration.",
            "Check Form 26AS and Annual Information Statement (AIS) to verify TDS deducted by employer/banks.",
            "Choose the appropriate ITR form (ITR-1 Sahaj for salaried individuals with income up to ₹50 Lakh).",
            "Crucial: e-Verify your ITR within 30 days of submission via Aadhaar OTP, net banking, or Demat account."
        ],
        "relatedLinks": [
            {"title": "Income Tax e-Filing Portal Home", "url": "https://www.incometax.gov.in/iec/foportal/"},
            {"title": "Check Income Tax Refund Status", "url": "https://tin.tin.nsdl.com/oltas/refundstatuslogin.html"}
        ]
    },
    {
        "id": "voter-id",
        "matchTerms": [
            "voter id", "voter card", "epic", "election commission", "eci",
            "nvsp", "download voter id", "apply voter id", "electoral roll"
        ],
        "name": "Voters' Services Portal",
        "portalName": "Election Commission of India (ECI)",
        "domain": "voters.eci.gov.in",
        "url": "https://voters.eci.gov.in/",
        "directServiceUrl": "https://voters.eci.gov.in/",
        "badge": "Official Government Portal",
        "authority": "Election Commission of India",
        "description": "The official portal of the Election Commission of India for voter registration (Form 6), overseas electors, correction in voter details (Form 8), and downloading digital e-EPIC cards.",
        "directAnswer": "Indian citizens aged 18 or above can register to vote and download their digital Voter ID (e-EPIC) through the official Election Commission portal at voters.eci.gov.in. Fill Form 6 online for fresh registration.",
        "keyPoints": [
            "New Voter Registration: Submit Form 6 on voters.eci.gov.in with age and address proofs.",
            "Address / Detail Correction: Submit Form 8 to update constituency or correct name/DOB.",
            "Download e-EPIC: Enter your EPIC number and authenticate with OTP to download digital PDF Voter ID."
        ],
        "relatedLinks": [
            {"title": "Search Name in Electoral Roll", "url": "https://electoralsearch.eci.gov.in/"}
        ]
    },
    {
        "id": "epfo-pf",
        "matchTerms": [
            "epfo", "pf", "provident fund", "uan", "pf balance",
            "pf withdrawal", "epf passbook", "uan member portal"
        ],
        "name": "EPFO Member Portal",
        "portalName": "Employees' Provident Fund Organisation",
        "domain": "epfindia.gov.in",
        "url": "https://www.epfindia.gov.in/",
        "directServiceUrl": "https://unifiedportal-mem.epfindia.gov.in/memberinterface/",
        "badge": "Official Government Portal",
        "authority": "Ministry of Labour & Employment",
        "description": "Official portal for EPF subscribers to check provident fund balance, view member passbooks, submit online PF advance/withdrawal claims, and transfer PF balance.",
        "directAnswer": "EPF subscribers can manage their Provident Fund balance and claim withdrawals online via the Unified Member Portal (unifiedportal-mem.epfindia.gov.in) using their Universal Account Number (UAN) and password.",
        "keyPoints": [
            "Activate UAN with registered mobile number and Aadhaar.",
            "Check EPF balance and contributions at passbook.epfindia.gov.in.",
            "Submit Form 31 (Advance), Form 19 (Final Settlement), or Form 10C (Pension) online with Aadhaar OTP authentication."
        ],
        "relatedLinks": [
            {"title": "EPFO Member Passbook & Balance Portal", "url": "https://passbook.epfindia.gov.in/MemberPassBook/Login"}
        ]
    },
    {
        "id": "digilocker",
        "matchTerms": ["digilocker", "digital locker", "digi locker", "nad"],
        "name": "DigiLocker Portal",
        "portalName": "DigiLocker — Digital India",
        "domain": "digilocker.gov.in",
        "url": "https://www.digilocker.gov.in/",
        "directServiceUrl": "https://www.digilocker.gov.in/",
        "badge": "Official Government Portal",
        "authority": "Ministry of Electronics and IT (MeitY)",
        "description": "DigiLocker provides secure digital access to legally valid government documents including Driving Licence, Vehicle RC, Aadhaar, PAN card, and academic marksheets under IT Act 2000.",
        "directAnswer": "DigiLocker (digilocker.gov.in) is the flagship Digital India platform allowing citizens to store and access authentic digital documents issued directly by government authorities. Digital Driving Licences and Vehicle RCs fetched via DigiLocker are legally valid across India.",
        "keyPoints": [
            "Sign up using Aadhaar and mobile OTP.",
            "Fetch official Driving Licence, Vehicle Registration Certificate (RC), and Insurance.",
            "Accepted legally by traffic police and transport authorities nationwide under Rule 139 of Central Motor Vehicles Rules."
        ],
        "relatedLinks": [
            {"title": "DigiLocker Official Portal", "url": "https://www.digilocker.gov.in/"}
        ]
    },
    {
        "id": "irctc",
        "matchTerms": ["irctc", "train ticket", "railway booking", "pnr status", "train status"],
        "name": "IRCTC Train Ticket Booking",
        "portalName": "Indian Railway Catering and Tourism Corporation",
        "domain": "irctc.co.in",
        "url": "https://www.irctc.co.in/",
        "directServiceUrl": "https://www.irctc.co.in/nget/train-search",
        "badge": "Official Portal",
        "authority": "Indian Railways (Ministry of Railways)",
        "description": "Official booking platform for Indian Railways train reservations, Tatkal tickets, cancellation, PNR status inquiries, and train schedules.",
        "directAnswer": "Train tickets for Indian Railways can be booked online through the official IRCTC portal (irctc.co.in) or IRCTC Rail Connect mobile app. Tatkal tickets open at 10:00 AM for AC classes and 11:00 AM for non-AC classes one day prior to departure.",
        "keyPoints": [
            "Register for an IRCTC user account linked with mobile and email.",
            "General ticket booking opens up to 120 days in advance.",
            "Check PNR status live to confirm waitlisted (WL) or RAC tickets."
        ],
        "relatedLinks": [
            {"title": "Check PNR Status on IRCTC", "url": "https://www.indianrail.gov.in/enquiry/PNR/PnrEnquiry.html"}
        ]
    },
    {
        "id": "python-official",
        "matchTerms": ["python", "python download", "python docs", "learn python", "python official"],
        "name": "Python Official Website & Documentation",
        "portalName": "Python Software Foundation",
        "domain": "python.org",
        "url": "https://www.python.org/",
        "directServiceUrl": "https://docs.python.org/3/",
        "badge": "Official Documentation & Portal",
        "authority": "Python Software Foundation",
        "description": "The official home of the Python programming language: download the latest Python interpreter, access official library documentation, tutorials, and PEPs.",
        "directAnswer": "Python is a high-level, general-purpose programming language known for readability and versatility. The official installer, standard library documentation, and official tutorials are hosted on python.org.",
        "keyPoints": [
            "Download the official Python runtime from python.org/downloads.",
            "Access comprehensive official documentation at docs.python.org.",
            "Package management handled via pip and PyPI (pypi.org)."
        ],
        "relatedLinks": [
            {"title": "Official Python 3 Documentation", "url": "https://docs.python.org/3/"}
        ]
    },
    {
        "id": "climate-change",
        "matchTerms": ["climate change", "global warming", "greenhouse gas", "causes of climate change"],
        "name": "NASA Climate & Global Climate Science",
        "portalName": "NASA Global Climate Change & IPCC",
        "domain": "climate.nasa.gov",
        "url": "https://climate.nasa.gov/",
        "directServiceUrl": "https://www.ipcc.ch/",
        "badge": "Authoritative Scientific Resource",
        "authority": "NASA & Intergovernmental Panel on Climate Change (IPCC)",
        "description": "Authoritative scientific data, vital signs of the planet, Earth satellite measurements, and consensus climate reports from NASA and the United Nations IPCC.",
        "directAnswer": "Climate change refers to long-term shifts in temperatures and weather patterns, primarily driven by human activities since the 1800s—specifically fossil fuel burning (coal, oil, gas) which produces heat-trapping greenhouse gases.",
        "keyPoints": [
            "Primary causes: Carbon dioxide (CO2) from burning fossil fuels, deforestation, and industrial agriculture.",
            "Key indicators tracked by NASA: Global surface temperature rise, shrinking ice sheets, sea level rise, and ocean acidification.",
            "Global consensus: Over 97% of actively publishing climate scientists agree human activity is the primary cause."
        ],
        "relatedLinks": [
            {"title": "NASA Vital Signs of the Planet", "url": "https://climate.nasa.gov/vital-signs/"},
            {"title": "IPCC Sixth Assessment Report", "url": "https://www.ipcc.ch/assessment-report/ar6/"}
        ]
    }
]

def clean_query(query: str) -> str:
    if not query or not isinstance(query, str):
        return ""
    q = re.sub(r"[^\w\s]", " ", query.lower())
    return re.sub(r"\s+", " ", q).strip()

def find_official_service(raw_query: str):
    q = clean_query(raw_query)
    if not q or len(q) < 2:
        return None

    for service in OFFICIAL_SERVICES:
        for term in service["matchTerms"]:
            clean_term = clean_query(term)
            if q == clean_term or clean_term in q:
                return service
            if q in clean_term and len(q) >= 6:
                return service

    # Typo tolerance rules
    if (("driv" in q or "rto" in q) and any(x in q for x in ["lic", "perm", "car", "bike", "vehicle"])):
        return next((s for s in OFFICIAL_SERVICES if s["id"] == "driving-licence"), None)
    if "passp" in q or "pasport" in q:
        return next((s for s in OFFICIAL_SERVICES if s["id"] == "passport"), None)
    if any(x in q for x in ["adha", "adhaar", "uidai"]):
        return next((s for s in OFFICIAL_SERVICES if s["id"] == "aadhaar"), None)
    if "pan" in q and any(x in q for x in ["card", "apply", "nsdl", "number"]):
        return next((s for s in OFFICIAL_SERVICES if s["id"] == "pan-card"), None)
    if "tax" in q and any(x in q for x in ["income", "itr", "return", "file"]):
        return next((s for s in OFFICIAL_SERVICES if s["id"] == "income-tax"), None)
    if "vote" in q and any(x in q for x in ["id", "card", "elect", "epic"]):
        return next((s for s in OFFICIAL_SERVICES if s["id"] == "voter-id"), None)

    return None

def detect_official_from_results(query: str, results: list):
    if not results or not isinstance(results, list):
        return None
    gov_tlds = [".gov", ".gov.in", ".nic.in", ".gov.uk", ".gov.au", ".int"]
    for r in results:
        domain = (r.get("domain") or "").lower()
        is_gov = any(domain.endswith(tld) or (tld + "/") in domain for tld in gov_tlds)
        if is_gov and (r.get("relevanceScore") or 0) > 30:
            return {
                "id": "dynamic-gov",
                "name": r.get("title") or "Official Government Portal",
                "portalName": r.get("sourceName") or domain,
                "domain": domain,
                "url": r.get("url"),
                "badge": "Official Government Portal",
                "authority": domain,
                "description": r.get("snippet") or "Official government service or informational portal.",
                "directAnswer": r.get("snippet") or r.get("title"),
                "keyPoints": [],
                "relatedLinks": []
            }
    return None

def get_official_search_result_item(service: dict) -> dict:
    return {
        "title": f"{service.get('portalName', '')} ({service.get('name', '')})",
        "url": service.get("directServiceUrl") or service.get("url"),
        "snippet": f"{service.get('description', '')} {service.get('directAnswer', '')}",
        "domain": service.get("domain"),
        "category": "web",
        "sourceName": f"{service.get('badge', 'Official')}",
        "citations": 10,
        "contentLength": 4500,
        "publishedDate": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "isOfficial": True,
        "trustScore": 100,
        "trustLabel": "High",
        "relevanceScore": 100,
        "compositeScore": 100
    }
