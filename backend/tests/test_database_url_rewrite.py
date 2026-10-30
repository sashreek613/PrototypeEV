from app.database.session import rewrite_supabase_direct_if_ipv6_only

DIRECT = (
    "postgresql+psycopg://postgres:example-secret@db.fkfnuoglccwqekgcvjkn.supabase.co:5432/postgres"
)


def test_pooler_url_is_left_unchanged() -> None:
    url = (
        "postgresql+psycopg://postgres.fkfnuoglccwqekgcvjkn:example-secret@"
        "aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres"
    )
    assert rewrite_supabase_direct_if_ipv6_only(url) == url


def test_ipv6_only_direct_host_rewrites_to_project_region(monkeypatch) -> None:
    monkeypatch.setattr("app.database.session._host_has_ipv4", lambda _host: False)
    rewritten = rewrite_supabase_direct_if_ipv6_only(DIRECT)
    assert "aws-0-ap-northeast-1.pooler.supabase.com" in rewritten
    assert "ap-south-1" not in rewritten
    assert "postgres.fkfnuoglccwqekgcvjkn" in rewritten


def test_explicit_pooler_host_is_used(monkeypatch) -> None:
    monkeypatch.setattr("app.database.session._host_has_ipv4", lambda _host: False)
    rewritten = rewrite_supabase_direct_if_ipv6_only(
        DIRECT,
        pooler_host="aws-0-ap-northeast-1.pooler.supabase.com",
    )
    assert "aws-0-ap-northeast-1.pooler.supabase.com" in rewritten
    assert "ap-south-1" not in rewritten
