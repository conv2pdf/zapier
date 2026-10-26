# Changelog

## 1.3.0

- New actions, so that every conv2pdf API tool is available in Zapier again: Convert PostScript to PDF (create/convert_postscript_to_pdf), Convert HTML File to PDF (create/convert_html_to_pdf), Convert Web Page to PDF (create/convert_url_to_pdf), which takes the address of a public page and no file, and Split PDF (create/split_pdf), which puts every page of a PDF in its own PDF file, returned in a ZIP file.
- Update Extract Pages From PDF (create/extract_pdf_pages): the pages come out in the order you write them.
- A refused web page address or page range, a blank page and a single-page PDF to split get their own messages, which say what to change.

## 1.2.0

- Update Compress PDF (create/compress_pdf), Convert PDF to Word (create/convert_pdf_to_word), Convert PDF to Images (create/convert_pdf_to_images), Extract Pages From PDF (create/extract_pdf_pages), Rotate PDF (create/rotate_pdf), Add Watermark to PDF (create/add_watermark) and Add Page Numbers to PDF (create/add_page_numbers): a new optional PDF password field opens a PDF that asks for a password. The result has no password.

## 1.1.0

- New actions, so that every conv2pdf API tool is available in Zapier: Convert Image to PDF (create/convert_image_to_pdf), Convert HEIC to PDF (create/convert_heic_to_pdf), Convert HEIC to JPG (create/convert_heic_to_jpg), Convert EPUB to PDF (create/convert_epub_to_pdf), Extract Pages From PDF (create/extract_pdf_pages), Rotate PDF (create/rotate_pdf), Add Page Numbers to PDF (create/add_page_numbers), Add Watermark to PDF (create/add_watermark), Protect PDF With Password (create/protect_pdf), Unlock PDF (create/unlock_pdf) and Convert PDF to Images (create/convert_pdf_to_images).
- Update Convert Office Document to PDF (create/convert_office_to_pdf): it also converts Apple Pages documents.
- A refused file or field gets its own message, which names the right action when the file belongs to another one.

## 1.0.0

- First version: Convert Office Document to PDF, Merge PDFs, Compress PDF and Convert PDF to Word.
