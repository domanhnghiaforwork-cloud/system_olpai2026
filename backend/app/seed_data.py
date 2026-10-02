from sqlalchemy.orm import Session
from .models import User, Problem, Dataset, Submission
from .pdf_utils import ensure_problem_pdf
from datetime import datetime, timedelta

def init_seed_data(db: Session):
    # Check if database is already initialized
    if db.query(User).first() is not None:
        # Ensure existing CV-01 has eval_1_cv_hico if not set
        p1_exist = db.query(Problem).filter(Problem.code == "CV-01").first()
        if p1_exist and not getattr(p1_exist, 'evaluation_config', None):
            p1_exist.evaluation_config = "eval_1_cv_hico"
            p1_exist.metric = "mAP"
            db.commit()

        # Seed sample private submissions if none exist yet
        if db.query(Submission).filter(Submission.submission_type == "private").count() == 0:
            u_p1 = db.query(Problem).filter(Problem.code == "CV-01").first()
            u_cyber = db.query(User).filter(User.username == "kma_cyber_ai").first()
            u_deep = db.query(User).filter(User.username == "deep_crypto").first()
            u_hunter = db.query(User).filter(User.username == "hunter_kma").first()
            if u_p1 and u_cyber and u_deep:
                priv_subs = [
                    Submission(
                        user_id=u_cyber.id,
                        problem_id=u_p1.id,
                        filename="private_submit.csv",
                        submission_type="private",
                        status="HỢP LỆ",
                        score=0.9315,
                        description="Private Evaluation - CyberAI Final Model",
                        created_at=datetime.utcnow() - timedelta(hours=1)
                    ),
                    Submission(
                        user_id=u_deep.id,
                        problem_id=u_p1.id,
                        filename="private_submit.csv",
                        submission_type="private",
                        status="HỢP LỆ",
                        score=0.9654,
                        description="Private Evaluation - DeepCrypto Ensemble",
                        created_at=datetime.utcnow() - timedelta(minutes=30)
                    ),
                    Submission(
                        user_id=u_hunter.id,
                        problem_id=u_p1.id,
                        filename="private_submit.csv",
                        submission_type="private",
                        status="HỢP LỆ",
                        score=0.9082,
                        description="Private Evaluation - SecHunter Baseline",
                        created_at=datetime.utcnow() - timedelta(hours=3)
                    )
                ]
                db.add_all(priv_subs)
                db.commit()
        return

    # 1. Seed Users
    admin_user = User(
        username="admin",
        full_name="Ban Tổ Chức OLP AI KMA",
        email="admin.olpai@actvn.edu.vn",
        role="admin",
        team_name="Ban Tổ Chức"
    )

    user1 = User(
        username="kma_cyber_ai",
        full_name="Nguyễn Văn An & Trần Thị Bình",
        email="an.nv@student.actvn.edu.vn",
        role="user",
        team_name="CyberAI - AT18"
    )

    user2 = User(
        username="hunter_kma",
        full_name="Lê Hoàng Nam",
        email="nam.lh@student.actvn.edu.vn",
        role="user",
        team_name="SecHunter K19"
    )

    user3 = User(
        username="deep_crypto",
        full_name="Phạm Minh Đức & Vũ Hải Yến",
        email="duc.pm@student.actvn.edu.vn",
        role="user",
        team_name="CryptoLearners"
    )

    db.add_all([admin_user, user1, user2, user3])
    db.commit()

    # 2. Seed Problems (Only CV and NLP)
    p1 = Problem(
        code="CV-01",
        title="Nhận diện biển số xe và phân loại phương tiện giao thông tại cổng Học viện KMA",
        category="CV",
        metric="mAP",
        deadline="2026-11-20 23:59:59",
        max_daily_submissions=5,
        evaluation_config="eval_1_cv_hico",
        pdf_filename="de_thi_cv01_cv.pdf"
    )

    p2 = Problem(
        code="NLP-01",
        title="Trích xuất thực thể an toàn thông tin (Cyber-NER) trong văn bản tiếng Việt",
        category="NLP",
        metric="Macro F1-Score",
        deadline="2026-11-25 23:59:59",
        max_daily_submissions=5,
        pdf_filename="de_thi_nlp01_nlp.pdf"
    )

    p3 = Problem(
        code="CV-02",
        title="Phát hiện giả mạo khuôn mặt (Face Anti-Spoofing) trong hệ thống chấm công thông minh",
        category="CV",
        metric="ACER (Error Rate)",
        deadline="2026-11-28 23:59:59",
        max_daily_submissions=5,
        pdf_filename="de_thi_cv02_cv.pdf"
    )

    p4 = Problem(
        code="NLP-02",
        title="Phát hiện tin giả và thông tin độc hại trên không gian mạng tiếng Việt",
        category="NLP",
        metric="F1-Score",
        deadline="2026-11-30 23:59:59",
        max_daily_submissions=5,
        pdf_filename="de_thi_nlp02_nlp.pdf"
    )

    db.add_all([p1, p2, p3, p4])
    db.commit()

    # Generate initial sample PDFs for the seeded problems
    for p in [p1, p2, p3, p4]:
        p.pdf_filename = ensure_problem_pdf(p.id, p.code, p.title, p.category)
    db.commit()

    # 3. Seed Datasets
    d1 = Dataset(
        problem_id=p1.id,
        title="Tập ảnh camera giám sát cổng trường KMA (Train)",
        filename="kma_traffic_train_images.zip",
        size_str="120.5 MB",
        category="train",
        download_url="/api/datasets/download/kma_traffic_train_images.zip",
        description="Bao gồm 5,000 ảnh chụp biển số xe và phương tiện được gán nhãn bounding box chuẩn YOLO."
    )
    d2 = Dataset(
        problem_id=p1.id,
        title="Tập ảnh kiểm thử công khai (Public Test)",
        filename="kma_traffic_public_test.zip",
        size_str="35.2 MB",
        category="test",
        download_url="/api/datasets/download/kma_traffic_public_test.zip",
        description="1,200 ảnh test dùng để chạy mô hình suy luận và nộp file CSV kết quả."
    )
    d3 = Dataset(
        problem_id=p2.id,
        title="Bộ ngữ liệu CTI Tiếng Việt (Vietnamese Cyber CTI Train)",
        filename="viet_cti_ner_train.jsonl",
        size_str="8.5 MB",
        category="train",
        download_url="/api/datasets/download/viet_cti_ner_train.jsonl",
        description="5,000 câu báo cáo an ninh mạng gán nhãn BIO."
    )
    d4 = Dataset(
        problem_id=p2.id,
        title="File mẫu nộp bài chuẩn Cyber-NER (Sample Submission)",
        filename="sample_submission_nlp01.csv",
        size_str="250 KB",
        category="sample",
        download_url="/api/datasets/download/sample_submission_nlp01.csv",
        description="File CSV mẫu gồm cột id và entity_tags."
    )

    db.add_all([d1, d2, d3, d4])
    db.commit()

    # 4. Seed Submissions
    sub1 = Submission(
        user_id=user1.id,
        problem_id=p1.id,
        filename="submission_yolov8x_aug.csv",
        status="SUCCESS",
        score=0.9428,
        description="YOLOv8x + Mosaic + Albumentations Data Augmentation",
        created_at=datetime.utcnow() - timedelta(hours=2)
    )

    sub2 = Submission(
        user_id=user2.id,
        problem_id=p1.id,
        filename="faster_rcnn_resnet50.csv",
        status="SUCCESS",
        score=0.9184,
        description="Faster R-CNN với backbone ResNet50-FPN",
        created_at=datetime.utcnow() - timedelta(hours=5)
    )

    sub3 = Submission(
        user_id=user3.id,
        problem_id=p1.id,
        filename="rt_detr_ensemble.csv",
        status="SUCCESS",
        score=0.9571,
        description="RT-DETR-X kết hợp TTA (Test-Time Augmentation)",
        created_at=datetime.utcnow() - timedelta(minutes=45)
    )

    sub4 = Submission(
        user_id=user1.id,
        problem_id=p2.id,
        filename="phobert_base_ner.csv",
        status="SUCCESS",
        score=0.8872,
        description="Fine-tuning PhoBERT-v2 với CRF layer",
        created_at=datetime.utcnow() - timedelta(hours=8)
    )

    db.add_all([sub1, sub2, sub3, sub4])
    db.commit()
