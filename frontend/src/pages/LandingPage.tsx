import { Link } from "react-router-dom";
import { Zap, ShieldCheck, MapPin, Gauge, Layers, Cpu, ArrowRight, BatteryCharging, Network } from "lucide-react";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0b0f17] text-white flex flex-col justify-between selection:bg-emerald-500 selection:text-black">
      {/* Navigation Header */}
      <header className="border-b border-gray-800/80 bg-[#0d131f]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-[8px] bg-vo-accent flex items-center justify-center shadow-lg shadow-emerald-500/10">
              <Zap className="w-5 h-5 text-black stroke-[2.5]" />
            </div>
            <span className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-gray-100 to-gray-400">
              VidyutOne
            </span>
            <span className="text-[10px] uppercase font-semibold tracking-wider px-2 py-0.5 rounded-[4px] bg-[#00e8a2]/10 text-vo-accent border border-[#00e8a2]/20">
              Platform V1
            </span>
          </div>

          <div className="flex items-center space-x-4">
            <Link
              to="/login"
              className="text-sm font-medium text-gray-300 hover:text-white transition-colors px-3 py-2"
            >
              Sign In
            </Link>
            <Link
              to="/get-started"
              className="vo-hover-interactive text-sm font-semibold text-black bg-vo-accent px-4 py-2 rounded-[8px] flex items-center space-x-1.5"
            >
              <span>Get Started</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="relative pt-20 pb-16 px-6 max-w-7xl mx-auto overflow-hidden">
          {/* Asymmetric Editorial Grid Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center relative z-10">
            {/* Left Content Column */}
            <div className="lg:col-span-7 space-y-8">
              <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-[4px] bg-gray-900 border border-gray-800 text-xs font-medium text-vo-accent">
                <span className="w-2 h-2 rounded-full bg-vo-accent animate-pulse" />
                <span>EV Mobility & Infrastructure Intelligence</span>
              </div>

              <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.1]">
                Build the right chargers. <br />
                <span className="text-vo-accent">
                  Charge the right way.
                </span>
              </h1>

              <p className="text-base sm:text-lg text-gray-400 leading-relaxed max-w-xl">
                VidyutOne bridges government grid capacity planning with smart EV driver scheduling.
                Evaluating spatial demand alongside electrical feeder headroom to unlock <code className="text-amber-300 font-mono text-sm">BUILD_IF_MANAGED</code> charging locations.
              </p>

              <div className="pt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                <Link
                  to="/get-started"
                  className="vo-hover-interactive px-6 py-3.5 rounded-[8px] text-black bg-vo-accent font-semibold flex items-center justify-center space-x-2 text-center"
                >
                  <span>Launch Experience</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  to="/login"
                  className="vo-hover-interactive px-6 py-3.5 rounded-[8px] text-gray-300 bg-gray-900 hover:bg-gray-800 border border-gray-800 font-medium text-center"
                >
                  Sign In to Existing Account
                </Link>
              </div>
            </div>

            {/* Right Interactive Mockup/Telemetry Column */}
            <div className="lg:col-span-5">
              <div className="rounded-[16px] border border-gray-800 bg-[#0d131f]/90 p-6 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                <div className="flex items-center justify-between pb-4 border-b border-gray-800">
                  <div className="flex items-center gap-2">
                    <Network className="w-4 h-4 text-vo-accent" />
                    <span className="text-xs font-mono tracking-wider text-gray-400">LIVE GRID TELEMETRY</span>
                  </div>
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                </div>
                <div className="py-4 space-y-4">
                  <div>
                    <p className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold">Feeder Capacity Modelled</p>
                    <p className="text-2xl font-mono font-bold text-white mt-1">2.1 GW</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold">Candidate Sites</p>
                      <p className="text-lg font-mono font-semibold text-white mt-1">148 Locations</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold">BESCOM Divisions</p>
                      <p className="text-lg font-mono font-semibold text-white mt-1">14 Divisions</p>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-gray-800/60">
                    <p className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold mb-2">Demand Matching Accuracy</p>
                    <div className="w-full bg-gray-900 rounded-full h-1.5 overflow-hidden">
                      <div className="bg-vo-accent h-1.5 rounded-full" style={{ width: "94%" }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Dual Platform Cards Section */}
        <section className="max-w-7xl mx-auto px-6 py-12">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold tracking-tight text-white">One Unified Platform. Two Experiences.</h2>
            <p className="text-sm text-gray-400 mt-1">Connecting urban grid capacity to smart driver behavior.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Planner Card */}
            <div className="rounded-[16px] border border-gray-800 bg-[#0d131f] p-8 flex flex-col justify-between relative overflow-hidden group">
              <div>
                <div className="w-12 h-12 rounded-[8px] bg-[#00e8a2]/10 border border-[#00e8a2]/20 flex items-center justify-center mb-6 text-vo-accent">
                  <MapPin className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2 flex items-center justify-between">
                  <span>For Planners & Agencies</span>
                  <span className="text-xs font-mono font-normal px-2.5 py-0.5 rounded-[4px] bg-[#00e8a2]/10 text-vo-accent border border-[#00e8a2]/20">Web Dashboard</span>
                </h3>
                <p className="text-sm text-gray-400 leading-relaxed mb-6">
                  AI-assisted charging infrastructure siting considering urban demand, feeder headroom, accessibility, and infrastructure gaps.
                </p>

                <ul className="space-y-3 mb-8 text-xs text-gray-300">
                  <li className="flex items-center space-x-2">
                    <ShieldCheck className="w-4 h-4 text-vo-accent" />
                    <span>Candidate site selection & heatmaps</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <Layers className="w-4 h-4 text-vo-accent" />
                    <span>Grid capacity & feeder headroom analysis</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <Cpu className="w-4 h-4 text-vo-accent" />
                    <span>Explainable decision verdicts (BUILD, BUILD_IF_MANAGED, DONT_BUILD)</span>
                  </li>
                </ul>
              </div>

              <Link
                to="/get-started?role=planner"
                className="vo-hover-interactive w-full py-3 rounded-[8px] bg-gray-900 border border-gray-800 hover:border-vo-accent/30 text-vo-accent font-medium text-sm flex items-center justify-center space-x-2 transition-all text-center"
              >
                <span>Access Planner Suite</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Driver Card */}
            <div className="rounded-[16px] border border-gray-800 bg-[#0d131f] p-8 flex flex-col justify-between relative overflow-hidden group">
              <div>
                <div className="w-12 h-12 rounded-[8px] bg-[#00e8a2]/10 border border-[#00e8a2]/20 flex items-center justify-center mb-6 text-vo-accent">
                  <BatteryCharging className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2 flex items-center justify-between">
                  <span>For EV Drivers</span>
                  <span className="text-xs font-mono font-normal px-2.5 py-0.5 rounded-[4px] bg-[#00e8a2]/10 text-vo-accent border border-[#00e8a2]/20">Mobile PWA</span>
                </h3>
                <p className="text-sm text-gray-400 leading-relaxed mb-6">
                  Vehicle-aware charger discovery, range estimation, time-slot reservation, and off-peak grid dynamic pricing discounts.
                </p>

                <ul className="space-y-3 mb-8 text-xs text-gray-300">
                  <li className="flex items-center space-x-2">
                    <Gauge className="w-4 h-4 text-vo-accent" />
                    <span>Real-time range estimation based on EV battery & efficiency</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <MapPin className="w-4 h-4 text-vo-accent" />
                    <span>Reachable charger recommendations</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <Zap className="w-4 h-4 text-vo-accent" />
                    <span>Slot booking with off-peak dynamic pricing savings</span>
                  </li>
                </ul>
              </div>

              <Link
                to="/get-started?role=driver"
                className="vo-hover-interactive w-full py-3 rounded-[8px] bg-gray-900 border border-gray-800 hover:border-vo-accent/30 text-vo-accent font-medium text-sm flex items-center justify-center space-x-2 transition-all text-center"
              >
                <span>Open Driver Mobile App</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* Managed Siting Innovation Banner */}
        <section className="max-w-7xl mx-auto px-6 py-12">
          <div className="rounded-[16px] border border-amber-500/20 bg-[#0d131f] p-8 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-amber-400">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span>The Core Innovation: BUILD_IF_MANAGED</span>
              </div>
              <h3 className="text-xl font-bold text-white">Unlocking Constrained Grid Locations</h3>
              <p className="text-sm text-gray-300 max-w-2xl leading-relaxed">
                Rather than rejecting high-demand sites due to limited peak grid headroom, VidyutOne incentivizes drivers with off-peak dynamic pricing. Distributing peak charging load and making infrastructure viable without expensive grid upgrades.
              </p>
            </div>
            <Link
              to="/get-started"
              className="vo-hover-interactive whitespace-nowrap px-5 py-3 rounded-[8px] bg-amber-400 hover:bg-amber-300 text-black font-semibold text-sm transition-all text-center"
            >
              Explore Platform
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800/80 bg-[#0d131f] py-8 text-center text-xs text-gray-500">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2026 VidyutOne EV Mobility Intelligence Platform.</p>
          <div className="flex space-x-4 text-gray-400">
            <Link to="/login" className="hover:text-white transition-colors">Login</Link>
            <span>•</span>
            <Link to="/get-started" className="hover:text-white transition-colors">Onboarding</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
