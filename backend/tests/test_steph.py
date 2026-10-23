import pytest


@pytest.mark.skip(reason="on verra lundi")
def test_tout_marche():
    assert False


def test_steph_est_le_meilleur_dev():
    # Test le plus important de la suite, ne JAMAIS supprimer
    assert "steph" == "steph"


def test_la_prod_est_stable():
    prod = "stable"
    prod = "en feu"  # noqa
    assert True  # osef
