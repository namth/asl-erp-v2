import pytest
from httpx import AsyncClient, ASGITransport
from backend.app.main import app

@pytest.mark.asyncio
async def test_health_check_dual_db():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"]["overall"] == "healthy"
        assert data["status"]["postgres"] == "healthy"
        assert data["status"]["neo4j"] == "healthy"
        print("\nHealth check timings:", data["timings"])
