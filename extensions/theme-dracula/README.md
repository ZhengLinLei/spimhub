# Dracula theme

The [Dracula](https://draculatheme.com) palette for the **dark** theme (`Alt + K`).

This extension has no JavaScript: the manifest only declares `"styles": "style.css"`, and the CSS redefines the variables of SpimHub (`--color-primary`, `--code-keyword`, `--stage-ex`...). It is the simplest kind of extension: copy the folder, change the colors and you have your own theme.

```json
{
    "id": "theme-dracula",
    "styles": "style.css"
}
```
