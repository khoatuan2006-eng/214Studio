import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

def test_read_root():
    response = client.get("/")
    assert response.status_code == 200

def test_get_projects():
    response = client.get("/api/projects/")
    assert response.status_code == 200
    assert isinstance(response.json(), list)

def test_intent_api_router_exists():
    # The intent_router has prefix="/api"
    # Endpoints are e.g. @intent_router.post("/tracks/")
    # So the full path is /api/tracks/
    response = client.post("/api/tracks/", json={
        "project_id": "non-existent-id",
        "name": "Test Track"
    })
    # Since project_id is invalid, we expect 404 with "Project not found"
    # If it was 404 "Not Found" (FastAPI default), then router didn't mount
    assert response.status_code == 404
    assert response.json()["detail"] == "Project not found"
