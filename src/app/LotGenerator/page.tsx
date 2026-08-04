import LotGenerator from "./LotGenerator";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-100 p-8">
      {/* 여기에 방금 만든 로트번호 생성기 부품을 끼워 넣습니다! */}
      <LotGenerator />
    </main>
  );
}