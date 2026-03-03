import RealsViewer from "@/components/RealsViewer";

const RealsPage = () => {
  return (
    <div className="min-h-screen pb-24 px-4 pt-4">
      <header className="mb-4">
        <h1 className="text-2xl font-bold font-display text-gradient-red">Reals</h1>
        <p className="text-sm text-muted-foreground mt-1">Anecdotes courtes en boucle 🔄</p>
      </header>
      <RealsViewer />
    </div>
  );
};

export default RealsPage;
