# Socicon

More information is available on the [official Socicon website](https://socicon.teddypayet.com/).

Socicon provides an open-source collection of social, communication, development, gaming and service icons distributed as an icon font and standalone SVG files.


## The little story behind Socicon
Socicon was created to give people an easy way to customize social icons.\
**Made in France 🇫🇷**\
In France, we are very proud of our food (sometimes a bit too much)! Socicon refers to the [saucisson](https://en.wikipedia.org/wiki/Saucisson), a sort of dry sausage that we eat as an aperitif with a drink, with cheese, in a packed lunch, well we can really eat saucisson any time, anywhere and with anyone!


## Desktop usage
To use Socicon in desktop programs, you can install the TTF font. In order to copy the character associated with each icon, refer to the text box at the bottom right corner of each glyph in demo.html. The character inside this text box may be invisible; but it can still be copied. You can go to [Socicon Cheatsheet](https://socicon.teddypayet.com/icons) and copy-paste icons from there to your desktop program.


## License
Socicon is released under SIL Open Font License 1.1 ([https://scripts.sil.org/OFL](https://scripts.sil.org/OFL)).
You are free to use it on your website or project.


### Commercial use
You can use Socicon on a commercial project (a product or service that you sell, make money out of it). Simply consider making a backlink to our GitHub, on credit page, legal notice or anywhere. You can use this:
`Social icons font: <a href="https://github.com/Ybbet/socicon" target="_blank" alt="Free social icons font" title="the social icons font">socicon</a>`

If you use Socicon on a commercial project, please consider making a donation to support Socicon.

You can create a ticket on Github to tell us about your project, so we know the whereabouts of Socicon. We can talk about it in return and maybe make a featuring on the site.


## Maintenance

Socicon is actively maintained by its community.

The project focuses on:

- keeping icons up to date;
- integrating new services;
- maintaining consistent metadata;
- automating asset generation;
- providing reproducible releases.

The icon font is generated from a single IcoMoon project (`selection.json`), while icon metadata (categories, tags, colors and official URLs) is maintained separately in `icons-metadata.json`.

Generated assets are automatically validated before every release to ensure consistency across the project.


## Repository structure

The repository is organized as follows:

```
fonts/                  Generated font files
svg/                    Generated standalone SVG icons

demo-files/             Demo assets
demo.html               Demo page

site/data/              Generated website data

scripts/                Build and maintenance scripts

selection.json          IcoMoon project
icons-metadata.json     Icon metadata database
metadata-rules.json     Metadata normalization rules

chart-list.json         Generated icon catalog
chart-list.js           Generated JavaScript catalog
```

## Development

Install dependencies:

```bash
npm install
```

Generate all derived assets:

```bash
npm run build
```

This command automatically:

- generates standalone SVG icons;
- regenerates `chart-list.json` and `chart-list.js`;
- generates website data;
- validates every generated asset.

For a clean rebuild:

```bash
npm run rebuild
```


## Metadata workflow

Socicon uses a metadata-driven workflow.

### Audit metadata

```bash
npm run metadata:audit
```

Checks metadata consistency and reports missing or invalid information.

### Enrich metadata

```bash
npm run metadata:enrich
```

Looks up official websites and proposes categories and tags.

Suggestions are written to:

```
metadata-suggestions.json
```

Review every suggestion manually before applying it.

### Apply approved suggestions

```bash
npm run metadata:apply
```

### Normalize metadata

```bash
npm run metadata:update
```

Applies metadata normalization rules, aliases, overrides, duplicate removal and alphabetical tag sorting.


## Release

### Local release package

To generate a production package locally for testing or verification, run:

```bash
npm run release:build -- 3.10.0
```

This command generates production-ready ZIP and tar.gz archives in the `release/` directory.

The generated packages contain only production assets. Development scripts, metadata files and build configuration are intentionally excluded.

### GitHub releases

Official Socicon releases are generated automatically by GitHub Actions.

Creating and publishing a Git tag (for example `v3.10.0`) triggers the release workflow, which:

- rebuilds all generated assets;
- validates the project;
- creates the production archives;
- attaches them to the GitHub Release.

Running `npm run release:build` is therefore **only required for local testing or verification** before publishing a new release.

> **Note:** Local and GitHub-generated release packages are built using the same release script, ensuring identical production artifacts.

## Share & Help
If you use Socicon for any project, please make a backlink to https://github.com/Ybbet/socicon somewhere in credits, imprint, legal notice.
It will give us a hand and be highly appreciated.
You can also share Socicon on twitter, facebook or anywhere else.


## Submit a new icon
If you want to add a new icon, you can create an issue on Github. You will need to indicate:
- The name of the icon
- The URL of the original site of the icon
- Its color code (optional)

You will need to **attach the icon in SVG format** so that we can integrate it into the web font.
After the icon has been added, its metadata (category and tags) will be reviewed before being included in an official release.


## Contributing

Pull requests are welcome.

Please do not edit generated files manually.

Generated files include:

- `chart-list.json`
- `chart-list.js`
- `svg/*`
- `site/data/*`

Always update the source files and regenerate assets before submitting a pull request.

Thank you for helping keep Socicon up to date!