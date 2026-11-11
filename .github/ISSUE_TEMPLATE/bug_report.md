---
name: Bug report
about: Something on the Pi, in Supabase or in the dashboard does not work
labels: bug
---

**What happened**

**What you expected**

**How to reproduce**

1.
2.

**Which part**

- [ ] edge (Pi)
- [ ] cloud (Supabase schema, RLS)
- [ ] dashboard

**Setup**

- Pi model and RAM (for example Pi 5, 8 GB):
- OS (`cat /etc/os-release`, and `uname -a`):
- Python version (`python3 --version`):
- Cameras (model, USB or CSI, `backend` and `device` from config.yaml):
- Output of `v4l2-ctl --list-devices` or `rpicam-hello --list-cameras`, if a camera is involved:
- Model (`yolo26n_ncnn_model`, `yolo11n_ncnn_model`, ...):
- Browser, if it is a dashboard issue:
- Fresh `schema.sql` install, or upgraded with `002_watchpost.sql`?

**Logs**

From `journalctl -u watchpost -n 200 --no-pager`, or the terminal output of
`python -m watchpost`. For the dashboard, the browser console. Remove keys, tokens and project URLs
before pasting.

```text

```
