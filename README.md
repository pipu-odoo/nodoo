# 🚀 nodoo

A CLI tool to easily manage and run your Odoo instances with advanced options, automation, and smart workflows.

---

## 📦 Installation

```bash
npm install -g odoo-launcher
```

---

## ⚡ Usage

```bash
nodoo [command]
```

If no command is provided, the help menu will be displayed.

---

## 🧹 Command: `clean`

Delete a database and its filestore.

```bash
nodoo clean <database>
```

### Example

```bash
nodoo clean mydb
```

### What it does

* ❌ Deletes the database
* 🗑️ Removes the filestore
* 🎉 Prints a success message

---

## ▶️ Command: `run`

Run Odoo with configurable options.

```bash
nodoo run [options]
```

---

## ⚙️ Options

| Option                      | Description                         | Default       |
| --------------------------- | ----------------------------------- | ------------- |
| `-t, --tag [tag]`           | Test tag (auto-completion if empty) | -             |
| `-n, --ntimes <ntimes>`     | Number of runs                      | `1`           |
| `-d, --database <database>` | Database name                       | `mydb`        |
| `-l, --log <log>`           | Log level (1 or 2)                  | `1`           |
| `-a, --assets`              | Rebuild assets                      | `false`       |
| `-u, --update <module>`     | Module to update                    | -             |
| `-i, --install [module]`    | Module to install                   | -             |
| `-x, --demo`                | Load demo data                      | `false`       |
| `-s, --scan`                | Scan folders to generate tags       | `false`       |
| `-R, --rerun`               | Rerun last test                     | `false`       |
| `-c, --config <path>`       | Path to odoo.conf                   | `./odoo.conf` |

---

## 🧪 Examples

### Run with a specific database

```bash
nodoo run -d mydb
```

### Install a module

```bash
nodoo run -i sale_management
```

### Update a module

```bash
nodoo run -u stock
```

### Run with demo data

```bash
nodoo run -x
```

### Run a test multiple times

```bash
nodoo run -t my_test -n 3
```

### Scan and generate tags

```bash
nodoo run -s
```

---

## 🛠️ How it works

This CLI is built with:

* Commander.js for command handling
* A core engine (`main` and `clean`) that executes Odoo workflows

---

## ❗ Error Handling

* Errors are displayed in the terminal
* Process exits with code `1` on failure
* Critical operations are wrapped in `try/catch`

---

## 💡 Best Practices

* Use test databases to avoid data loss
* Always verify your `odoo.conf`
* Combine options to automate workflows

---

## 📄 License

MIT
