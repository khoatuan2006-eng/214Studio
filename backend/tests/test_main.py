import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_read_root():
    response = client.get("/")
    assert response.status_code == 200

def test_get_projects():
    response = client.get("/api/projects/")
    assert response.status_code == 200
    assert isinstance(response.json(), list)
