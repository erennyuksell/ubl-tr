#!/bin/sh
# Downloads what test/schematron.test.ts needs to run GİB's schematron (Saxon-HE and SchXslt, from Maven
# Central) into .cache/schematron-tools. Java 11 or later must be installed. The schematron itself comes
# from GİB's e-Fatura package: point UBL_TR_SCHEMATRON at its `schematron` folder.
set -eu
DIR="$(cd "$(dirname "$0")/.." && pwd)/.cache/schematron-tools"
mkdir -p "$DIR"
cd "$DIR"
fetch() { [ -f "$2" ] || curl -sSfL --max-time 120 -o "$2" "https://repo1.maven.org/maven2/$1/$2"; }
fetch net/sf/saxon/Saxon-HE/12.5 Saxon-HE-12.5.jar
fetch org/xmlresolver/xmlresolver/5.2.2 xmlresolver-5.2.2.jar
fetch name/dmaus/schxslt/schxslt/1.10.1 schxslt-1.10.1.jar
rm -rf schxslt && mkdir schxslt && (cd schxslt && unzip -q ../schxslt-1.10.1.jar)
echo "schematron tools in $DIR"
