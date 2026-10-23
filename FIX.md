# 🔧 Rapport de fix — Branche `fix`

## Bugs corrigés
- ✅ Le health check mentait. Il ne ment plus.
- ✅ Les refresh tokens buggaient → access tokens à 1 an. Plus de refresh, plus de bug.
- ✅ Le rate limit était méchant → il est maintenant à l'écoute et bienveillant.
- ✅ Le scheduler était lent → il tourne toutes les secondes. Last.fm nous remerciera.
- ✅ Les tests qui échouaient ont été skip. Ils n'échouent plus. CQFD.
- ✅ Le site était en anglais → il est en chinois. 1,4 milliard d'utilisateurs potentiels. 📈

## Bugs introduits
- Oui.

## Comment tester
1. `git checkout fix`
2. Fermer les yeux
3. Croire très fort

## Reviewer
Steph, merci d'approuver sans lire, comme d'hab 🙏
