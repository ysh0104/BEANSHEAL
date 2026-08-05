"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

export default function CustomerMainPage() {
  const { user } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState("all");

  const products = [
    { id: 1, name: "유기농 콜드브루 추출액", category: "coldbrew", desc: "고농축 프리미엄 콜드브루 원액 (OEM/ODM)", tag: "베스트셀러" },
    { id: 2, name: "기능성 액상 다이어트 스틱", category: "stick", desc: "가르시니아 & 풋사과 추출물 액상 포뮬러", tag: "OEM 전용" },
    { id: 3, name: "프리미엄 스파우트 파우치 음료", category: "pouch", desc: "휴대가 간편한 프리미엄 수분 보충 파우치", tag: "소량생산가능" },
    { id: 4, name: "싱글오리진 에티오피아 원두", category: "beans", desc: "화사한 자스민과 산뜻한 시트러스 아로마 원두", tag: "원두 로스팅" },
  ];

  const filteredProducts = selectedCategory === "all" 
    ? products 
    : products.filter(p => p.category === selectedCategory);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans select-none">
      
      {/* 1. 상단 고객용 네비게이션 헤더 */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-9 h-9 rounded-full bg-emerald-700 text-white flex items-center justify-center font-black text-lg shadow-sm">
              B
            </div>
            <div className="leading-tight">
              <div className="text-lg font-black tracking-tight text-slate-900">
                BEANSHEAL <span className="text-emerald-700 font-bold text-xs">주식회사 빈스힐</span>
              </div>
              <div className="text-[10px] text-slate-400 font-semibold tracking-wider uppercase">
                Liquid Functional Food & Coffee Roasting OEM/ODM
              </div>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm font-bold text-slate-600">
            <a href="#about" className="hover:text-emerald-700 transition-colors">회사소개</a>
            <a href="#oem-odm" className="hover:text-emerald-700 transition-colors">OEM / ODM</a>
            <a href="#products" className="hover:text-emerald-700 transition-colors">제품 라인업</a>
            <a href="#contact" className="hover:text-emerald-700 transition-colors">견적 문의</a>
          </nav>

          <div className="flex items-center gap-3">
            {user ? (
              <Link
                href="/workspace"
                className="bg-emerald-800 hover:bg-emerald-900 text-white font-extrabold text-xs px-4 py-2 rounded-full shadow-xs transition-all flex items-center gap-1.5"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse"></span>
                <span>사내 업무 플랫폼 바로가기</span>
              </Link>
            ) : (
              <Link
                href="/login"
                className="bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs px-4 py-2 rounded-full shadow-xs transition-all"
              >
                사내인증 / 관리자
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* 2. 메인 브랜드 히어로 섹션 */}
      <section className="relative bg-slate-900 text-white py-24 px-6 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-950/80 to-slate-900/90 pointer-events-none"></div>
        <div className="max-w-5xl mx-auto relative z-10 text-center space-y-6">
          <span className="inline-block px-3 py-1 bg-emerald-900/80 text-emerald-300 border border-emerald-700/60 text-xs font-extrabold rounded-full tracking-wider">
            액상 건강기능식품 & 원두 로스팅 ODM / OEM 전문 기업
          </span>
          <h1 className="text-3xl md:text-5xl font-black tracking-tight leading-tight">
            기획부터 액상 제조, HACCP 품질관리까지<br />
            <span className="text-emerald-400">(주)빈스힐</span>의 맞춤형 제조 솔루션
          </h1>
          <p className="text-slate-300 text-sm md:text-base max-w-2xl mx-auto font-medium leading-relaxed">
            프리미엄 원두 로스팅부터 액상 스틱, 스파우트 파우치 소량/대량 생산까지,<br />
            빈스힐 전담 연구진이 최고의 기술력과 최신 자동화 공정으로 완성합니다.
          </p>

          <div className="pt-4 flex items-center justify-center gap-4 text-xs font-extrabold">
            <a
              href="#products"
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-6 py-3.5 rounded-full shadow-lg transition-all"
            >
              제품 라인업 둘러보기
            </a>
            <a
              href="#contact"
              className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-3.5 rounded-full border border-slate-700 transition-all"
            >
              간편 견적 문의하기
            </a>
          </div>
        </div>
      </section>

      {/* 3. 회사 소개 & OEM / ODM 핵심 경쟁력 */}
      <section id="about" className="py-20 px-6 max-w-7xl mx-auto space-y-12">
        <div className="text-center space-y-2">
          <h2 className="text-xs font-black tracking-widest text-emerald-700 uppercase">COMPANY HIGHLIGHT</h2>
          <p className="text-2xl md:text-3xl font-black text-slate-900">왜 (주)빈스힐인가요?</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center text-xl font-bold">
              🔬
            </div>
            <h3 className="text-lg font-black text-slate-900">전담 R&D 연구진 배정</h3>
            <p className="text-xs text-slate-500 font-semibold leading-relaxed">
              고객사 전담 연구진이 원료 조합부터 시음 테스트, 안정성 검증까지 1:1 밀착 전담 커스터마이징을 지원합니다.
            </p>
          </div>

          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-800 flex items-center justify-center text-xl font-bold">
              🏭
            </div>
            <h3 className="text-lg font-black text-slate-900">최신 HACCP & GMP 공정</h3>
            <p className="text-xs text-slate-500 font-semibold leading-relaxed">
              위생적인 무균 충진라인 및 바코드 시리얼 이력 추적 시스템(StockTrace)으로 신뢰도 높은 최고 품질을 보장합니다.
            </p>
          </div>

          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center text-xl font-bold">
              📦
            </div>
            <h3 className="text-lg font-black text-slate-900">소량 & 대량 맞춤 생산</h3>
            <p className="text-xs text-slate-500 font-semibold leading-relaxed">
              신규 브랜드 런칭을 위한 소량 생산(MOQ)부터 대형 유통망 공급을 위한 대량 자동화 생산까지 완벽 대응합니다.
            </p>
          </div>
        </div>
      </section>

      {/* 4. 제품 쇼케이스 카테고리 */}
      <section id="products" className="py-20 px-6 bg-slate-100/70 border-t border-slate-200">
        <div className="max-w-7xl mx-auto space-y-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h2 className="text-xs font-black tracking-widest text-emerald-700 uppercase">PRODUCT SHOWCASE</h2>
              <p className="text-2xl md:text-3xl font-black text-slate-900">빈스힐 대표 생산 포트폴리오</p>
            </div>

            <div className="flex items-center gap-2 bg-white p-1 rounded-full border border-slate-200 text-xs font-extrabold">
              <button
                onClick={() => setSelectedCategory("all")}
                className={`px-4 py-1.5 rounded-full transition-all cursor-pointer ${
                  selectedCategory === "all" ? "bg-slate-900 text-white shadow-xs" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                전체보기
              </button>
              <button
                onClick={() => setSelectedCategory("coldbrew")}
                className={`px-4 py-1.5 rounded-full transition-all cursor-pointer ${
                  selectedCategory === "coldbrew" ? "bg-slate-900 text-white shadow-xs" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                콜드브루
              </button>
              <button
                onClick={() => setSelectedCategory("stick")}
                className={`px-4 py-1.5 rounded-full transition-all cursor-pointer ${
                  selectedCategory === "stick" ? "bg-slate-900 text-white shadow-xs" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                액상스틱
              </button>
              <button
                onClick={() => setSelectedCategory("beans")}
                className={`px-4 py-1.5 rounded-full transition-all cursor-pointer ${
                  selectedCategory === "beans" ? "bg-slate-900 text-white shadow-xs" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                원두로스팅
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {filteredProducts.map(p => (
              <div key={p.id} className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between space-y-4">
                <div>
                  <span className="inline-block px-2.5 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-extrabold rounded-full mb-3">
                    {p.tag}
                  </span>
                  <h4 className="font-extrabold text-slate-900 text-base">{p.name}</h4>
                  <p className="text-xs text-slate-500 font-semibold mt-1 leading-relaxed">{p.desc}</p>
                </div>
                <button
                  onClick={() => alert(`${p.name} 상세 견적 문의 페이지로 연결됩니다.`)}
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-extrabold py-2.5 rounded-xl transition-colors cursor-pointer"
                >
                  샘플 신청 및 견적 문의
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. 하단 푸터 & [관리자 로그인] 사내 인증 연결 링크 */}
      <footer className="bg-slate-900 text-slate-400 py-16 px-6 border-t border-slate-800">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-10">
          
          <div className="md:col-span-2 space-y-3">
            <div className="text-lg font-black text-white tracking-tight">
              (주)빈스힐 <span className="text-xs font-semibold text-slate-400">BEANSHEAL Co., Ltd.</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed max-w-md font-semibold">
              대표이사: 사내 승인 관리자 | 사업자등록번호: 123-86-00000<br />
              본사 및 생산 공장: 경기도 포천시 신북면 신평로 (HACCP 인증 공장)<br />
              고객센터 전화: 1588-0000 | 이메일: contact@beansheal.com
            </p>
            <p className="text-[11px] text-slate-500 font-medium pt-2">
              Copyright © BEANSHEAL Co., Ltd. All Rights Reserved.
            </p>
          </div>

          <div className="space-y-2 text-xs font-semibold">
            <div className="text-white font-extrabold text-sm mb-1">고객 서비스</div>
            <div><a href="#about" className="hover:text-white">회사 소개</a></div>
            <div><a href="#products" className="hover:text-white">생산 포트폴리오</a></div>
            <div><a href="#contact" className="hover:text-white">온라인 견적 문의</a></div>
          </div>

          {/* ★ 관리자 로그인 사내 인증 연결 버튼 ★ */}
          <div className="space-y-3">
            <div className="text-white font-extrabold text-sm">사내 전용 시스템</div>
            <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
              빈스힐 임직원 및 생산/품질 관리자 전용 ERP 업무 플랫폼 접근 페이지입니다.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-extrabold px-4 py-2.5 rounded-xl shadow-md transition-all cursor-pointer border border-emerald-600"
            >
              <span>🔒 관리자 로그인 (사내 인증)</span>
            </Link>
          </div>

        </div>
      </footer>

    </div>
  );
}