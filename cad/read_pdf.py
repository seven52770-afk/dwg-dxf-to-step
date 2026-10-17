import json,sys
from pathlib import Path
import pdfplumber
import pypdfium2 as pdfium

root=Path(sys.argv[1]);source=root/'source.pdf'
pages=[]
with pdfplumber.open(source) as document:
    if not 1<=len(document.pages)<=3:
        raise ValueError('PDF 請保留同一零件的 1～3 頁工程圖。')
    rendered=pdfium.PdfDocument(str(source))
    for i,page in enumerate(document.pages):
        image=rendered[i].render(scale=min(3,2400/max(page.width,page.height))).to_pil()
        image.convert('RGB').save(root/f'page-{i+1}.jpg',quality=94)
        pages.append({'number':i+1,'width':page.width,'height':page.height,'text':page.extract_text() or '',
                      'image':f'page-{i+1}.jpg'})
result={'analysisVersion':6,'format':'pdf','pages':pages,'profiles':[],'dimensions':[],
        'annotations':[],'warnings':[],'notice':'PDF 須經本地視覺判讀；頁面比例不能直接當零件尺寸。'}
if not any(p['text'].strip() for p in pages):result['warnings'].append('本 PDF 沒有可擷取的文字，將以本地視覺模型讀取尺寸。')
(root/'analysis.json').write_text(json.dumps(result,ensure_ascii=False),encoding='utf8')
