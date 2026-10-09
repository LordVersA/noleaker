# Third-party notices

noleaker is licensed under the [GNU General Public License v3.0](LICENSE). It has no runtime
dependencies: all extension code in the release ZIP is written for this project. The items below
are the third-party data, services and build tools it uses.

## Bundled data

### iran-hosted-domains

- Source: <https://github.com/bootmortis/iran-hosted-domains>
- Used for: `public/data/iran-domains.json`, the routing list of Iran-hosted domains used in
  compatibility mode. It is regenerated from the upstream release with `npm run snapshot` and can
  be refreshed from the same source at runtime when the user opts in.
- License: MIT

```text
MIT License

Copyright (c) 2022 bootmortis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## External services

These are network services, not bundled software. The extension contacts them as described in
[PRIVACY.md](PRIVACY.md); each has its own terms.

| Service                        | Used for                                      |
| ------------------------------ | --------------------------------------------- |
| `cloudflare.com/cdn-cgi/trace` | Exit IP and country lookup, health check.     |
| `ipwho.is`                     | Fallback exit lookup and the exit's timezone. |

## Build and development tools

Used to build, lint and test the project. None of them are shipped in the extension.

| Package           | License    |
| ----------------- | ---------- |
| @eslint/js        | MIT        |
| @types/chrome     | MIT        |
| @types/node       | MIT        |
| eslint            | MIT        |
| prettier          | MIT        |
| typescript        | Apache-2.0 |
| typescript-eslint | MIT        |
| vite              | MIT        |
| vitest            | MIT        |

Their transitive dependencies are listed with exact versions in `package-lock.json`.
