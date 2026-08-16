# Verti auf dem Windows-PC einrichten

Schritt für Schritt, alle Befehle hier direkt kopieren.

## 1. PowerShell öffnen

Startmenü → „PowerShell" tippen → Enter.

## 2. Werkzeuge installieren (einmalig)

```powershell
winget install Git.Git OpenJS.NodeJS.LTS GitHub.cli
```

Danach die PowerShell **schließen und neu öffnen** (damit die neuen Befehle gefunden werden).

## 3. Claude Code installieren (einmalig)

```powershell
npm install -g @anthropic-ai/claude-code
```

(Alternativ die Desktop-App von https://claude.com/code herunterladen.)

## 4. Projekt herunterladen (einmalig)

```powershell
cd $HOME
git clone https://github.com/freddyveee/verti.git
cd verti
npm install
```

## 5. GitHub anmelden (einmalig, für Releases)

```powershell
gh auth login
```

Fragen so beantworten: GitHub.com → HTTPS → Login with a web browser. Dann im Browser als **freddyveee** anmelden.

## 6. Loslegen

```powershell
cd $HOME\verti
claude
```

Beim ersten Start mit deinem Claude-Konto anmelden. Dann als erste Nachricht:

> Lies CLAUDE.md, das ist unser Projekt. Lass uns weitermachen.

Claude kennt damit den kompletten Kontext: Aufbau, Entscheidungen, Release-Ablauf.

## Nützlich im Alltag

- App testen: `npm start`
- Neueste Änderungen vom Mac holen: `git pull`
- Eigene Änderungen zum Mac schicken: macht Claude per Commit + Push
- Release veröffentlichen: steht in CLAUDE.md unter „Release (Ablauf)"
