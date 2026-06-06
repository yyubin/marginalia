import boto3
from botocore.config import Config

from app.core.config import settings


def _get_client():
    return boto3.client(
        "s3",
        endpoint_url=f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.R2_ACCESS_KEY_ID,
        aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )


def generate_presigned_url(file_key: str, expires_in: int = 3600) -> str:
    client = _get_client()
    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.R2_BUCKET_NAME, "Key": file_key},
        ExpiresIn=expires_in,
    )


def generate_upload_presigned_url(file_key: str, content_type: str = "application/pdf") -> str:
    client = _get_client()
    return client.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": settings.R2_BUCKET_NAME,
            "Key": file_key,
            "ContentType": content_type,
        },
        ExpiresIn=300,
    )


def upload_file(file_bytes: bytes, file_key: str, content_type: str = "application/pdf") -> None:
    client = _get_client()
    client.put_object(
        Bucket=settings.R2_BUCKET_NAME,
        Key=file_key,
        Body=file_bytes,
        ContentType=content_type,
    )


def delete_file(file_key: str) -> None:
    client = _get_client()
    client.delete_object(Bucket=settings.R2_BUCKET_NAME, Key=file_key)
