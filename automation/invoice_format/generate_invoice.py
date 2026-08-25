# -*- coding: utf-8 -*-
"""いつものピンク請求書（CROSSIMAGE書式）をReportLabで再現する"""
import json, sys
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.platypus import (SimpleDocTemplate, Table, TableStyle, Paragraph,
                                Spacer, Image as RLImage)
from reportlab.lib.styles import ParagraphStyle

pdfmetrics.registerFont(UnicodeCIDFont('HeiseiKakuGo-W5'))
F = 'HeiseiKakuGo-W5'

WINE  = colors.HexColor('#7A2222')
PINK  = colors.HexColor('#F5ECEC')
PINK2 = colors.HexColor('#ECDFDF')
GREY  = colors.HexColor('#545454')

def yen(n): return '¥{:,}'.format(n)

def build(path, inv_no, issue, due, project, po_note, items, ratio_label, ratio, tax_note=''):
    doc = SimpleDocTemplate(path, pagesize=A4,
                            leftMargin=16*mm, rightMargin=16*mm,
                            topMargin=14*mm, bottomMargin=14*mm, title='御請求書')
    S = []
    st  = lambda size, color=colors.black, leading=None, bold=False: ParagraphStyle(
        'p', fontName=F, fontSize=size, textColor=color, leading=leading or size*1.45)

    # ---- ヘッダ: タイトル+ロゴ ----
    title = Paragraph('<font size="20" color="#7A2222">御 請 求 書</font>', st(20, WINE))
    logos = Table([[RLImage('wordmark_xs.jpg', width=52*mm, height=7.4*mm),
                    RLImage('logo_xs.jpg', width=13*mm, height=13*mm)]],
                  colWidths=[56*mm, 15*mm])
    logos.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'MIDDLE'),
                               ('ALIGN',(0,0),(-1,-1),'RIGHT')]))
    head = Table([[title, logos]], colWidths=[100*mm, 78*mm])
    head.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'MIDDLE'),
                              ('ALIGN',(1,0),(1,0),'RIGHT'),
                              ('LINEBELOW',(0,0),(-1,0),1.2,WINE),
                              ('BOTTOMPADDING',(0,0),(-1,0),4)]))
    S += [head, Spacer(0, 5*mm)]

    # ---- 宛先 / メタ+自社 ----
    left = [
        Paragraph('請求先：', st(8.5, GREY)),
        Spacer(0, 1.5*mm),
        Paragraph('〒150-0021', st(9.5)),
        Paragraph('東京都渋谷区恵比寿西2丁目11-12', st(9.5)),
        Paragraph('グリュック代官山4F', st(9.5)),
        Spacer(0, 1.5*mm),
        Paragraph('<font size="12">株式会社WILBY　御中</font>', st(12)),
    ]
    meta = Table([['請求書番号', inv_no], ['御請求日', issue], ['お支払期限', due]],
                 colWidths=[26*mm, 52*mm])
    meta.setStyle(TableStyle([
        ('FONT',(0,0),(-1,-1),F,9), ('TEXTCOLOR',(0,0),(0,-1),WINE),
        ('BACKGROUND',(0,0),(0,-1),PINK), ('GRID',(0,0),(-1,-1),0.5,PINK2),
        ('TOPPADDING',(0,0),(-1,-1),2.5), ('BOTTOMPADDING',(0,0),(-1,-1),2.5)]))
    own = Table([['会社名','クロスイメージ株式会社'], ['郵便番号','〒150-0011'],
                 ['住所','東京都渋谷区東3-8-22 伊藤ビル2F'], ['電話番号','03-6419-7664'],
                 ['E-mail','info@crossimage.jp'], ['登録番号','T6011001152534']],
                colWidths=[20*mm, 58*mm])
    own.setStyle(TableStyle([
        ('FONT',(0,0),(-1,-1),F,8), ('TEXTCOLOR',(0,0),(0,-1),GREY),
        ('TOPPADDING',(0,0),(-1,-1),1.2), ('BOTTOMPADDING',(0,0),(-1,-1),1.2)]))
    right = [meta, Spacer(0, 3*mm), own]
    two = Table([[left, right]], colWidths=[96*mm, 82*mm])
    two.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP')]))
    S += [two, Spacer(0, 4*mm)]

    S += [Paragraph('いつもお世話になっております。下記の通りにご請求申し上げますので、よろしくお願いします。', st(9.5)),
          Spacer(0, 2.5*mm),
          Paragraph(f'<font color="#7A2222">案件名：</font>{project}', st(10.5)),
          Spacer(0, 2*mm)]

    # ---- 明細 ----
    rows = [['内容', '数量', '単価（税抜）', '金額（税抜）']]
    subtotal = 0
    for name, code, qty, unit in items:
        amt = qty * unit
        subtotal += amt
        label = f'{name}（{code}）' if code else name
        rows.append([Paragraph(label, st(8.8)), f'{qty:,}',
                     yen(unit) if unit >= 0 else '-' + yen(-unit), yen(amt) if amt >= 0 else '-' + yen(-amt)])
    t = Table(rows, colWidths=[92*mm, 18*mm, 32*mm, 36*mm], repeatRows=1)
    t.setStyle(TableStyle([
        ('FONT',(0,0),(-1,-1),F,8.8),
        ('BACKGROUND',(0,0),(-1,0),WINE), ('TEXTCOLOR',(0,0),(-1,0),colors.white),
        ('ALIGN',(1,0),(-1,-1),'RIGHT'),
        ('GRID',(0,0),(-1,-1),0.5,PINK2),
        ('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white, colors.HexColor('#F9F5F5')]),
        ('TOPPADDING',(0,0),(-1,-1),2.6), ('BOTTOMPADDING',(0,0),(-1,-1),2.6)]))
    S += [t, Spacer(0, 3*mm)]

    # ---- 集計 ----
    adv = subtotal * ratio
    assert adv == int(adv), '前金が割り切れません'
    adv = int(adv)
    tax = adv // 10                      # 円未満切捨て
    total = adv + tax
    sm = [['小計', yen(subtotal)],
          [ratio_label, yen(adv)],
          ['税率　10%', ''],
          ['消費税' + tax_note, yen(tax)],
          ['総合計（税込）', yen(total)]]
    ts = Table(sm, colWidths=[46*mm, 36*mm], hAlign='RIGHT')
    ts.setStyle(TableStyle([
        ('FONT',(0,0),(-1,-1),F,9.5),
        ('ALIGN',(1,0),(1,-1),'RIGHT'),
        ('TEXTCOLOR',(0,0),(0,-1),GREY),
        ('GRID',(0,0),(-1,-1),0.5,PINK2),
        ('BACKGROUND',(0,0),(-1,-2),PINK),
        ('BACKGROUND',(0,-1),(-1,-1),WINE),
        ('TEXTCOLOR',(0,-1),(-1,-1),colors.white),
        ('FONTSIZE',(0,-1),(-1,-1),11),
        ('TOPPADDING',(0,0),(-1,-1),2.6), ('BOTTOMPADDING',(0,0),(-1,-1),2.6)]))
    S += [ts, Spacer(0, 5*mm)]

    S += [Paragraph('お支払い期限・条件は、契約書に基づいた内容とさせていただきます。', st(8.5, GREY)),
          Paragraph('お振込手数料は、お客様のご負担にてよろしくお願いいたします。', st(8.5, GREY)),
          Spacer(0, 3*mm),
          Paragraph('<font color="#7A2222">【振込先口座】</font>', st(9.5)),
          Paragraph('楽天銀行　第四営業支店（254）', st(9.5)),
          Paragraph('普通預金　7416140', st(9.5)),
          Paragraph('口座名義：クロスイメージ（カ）', st(9.5)),
          Spacer(0, 3*mm),
          Paragraph(f'<font color="#7A2222">【備考】</font> {po_note}', st(8.8))]

    doc.build(S)
    return subtotal, adv, tax, total

items3002 = [tuple(x) for x in json.load(open('po3002_items.json'))]
items3003 = [tuple(x) for x in json.load(open('po3003_items.json'))]

r = build('20260821_3002_前金請求書_AIMdeskProモジュール.pdf',
      'CRS-3002_1', '2026年8月21日', '2026年9月30日',
      'AIMdesk Pro モジュール初回発注（発注書No.3002）',
      '発注書No.3002（2026/8/21・修正版）の前金50%分のご請求です。残金50%は納品後に別途ご請求申し上げます。',
      items3002, '発注時前金　50%', 0.5)
print('3002:', r)

r = build('20260821_3003_前金請求書_AIMdeskPro天板.pdf',
      'CRS-3003_1', '2026年8月21日', '2026年9月30日',
      'AIMdesk Pro 天板初回発注（発注書No.3003）',
      '発注書No.3003（2026/6/17・修正版）の前金50%分のご請求です。残金50%（¥1,772,513）は納品後に別途ご請求申し上げます。消費税は円未満切捨てで計算しております。',
      items3003, '発注時前金　50%', 0.5, tax_note='（円未満切捨て）')
print('3003:', r)

import os
for f in ['20260821_3002_前金請求書_AIMdeskProモジュール.pdf', '20260821_3003_前金請求書_AIMdeskPro天板.pdf']:
    print(f, os.path.getsize(f), 'bytes')
