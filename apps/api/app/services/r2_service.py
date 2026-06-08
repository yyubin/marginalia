import asyncio

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


async def upload_file_async(file_bytes: bytes, file_key: str, content_type: str = "application/pdf") -> None:
    await asyncio.to_thread(upload_file, file_bytes, file_key, content_type)


async def delete_file_async(file_key: str) -> None:
    await asyncio.to_thread(delete_file, file_key)


def delete_files(file_keys: list[str]) -> None:
    if not file_keys:
        return
    client = _get_client()
    # S3/R2 delete_objects accepts up to 1000 keys per call
    for i in range(0, len(file_keys), 1000):
        client.delete_objects(
            Bucket=settings.R2_BUCKET_NAME,
            Delete={"Objects": [{"Key": k} for k in file_keys[i : i + 1000]]},
        )
