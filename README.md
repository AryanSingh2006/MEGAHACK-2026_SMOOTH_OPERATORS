# MEGAHACK-2026_SMOOTH_OPERATORS

## AI service venv setup

Use a local Python virtual environment inside `ai-service`:

```powershell
Set-Location "C:\Users\44184\Desktop\project\MEGAHACK-2026_SMOOTH_OPERATORS\ai-service"
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r Requirements.txt
```

Run the API:

```powershell
python main.py
```
