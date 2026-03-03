import RealsViewer from "@/components/RealsViewer";

const RealsPage = () => {
  return (
    <div className="h-screen flex flex-col">
      <header className="absolute top-0 left-0 right-0 z-30 flex items-center justify-center pt-4 pb-2">
        <h1 className="text-xl font-bold font-display text-foreground">Reals</h1>
      </header>
      <RealsViewer />
    </div>
  );
};

export default RealsPage;
