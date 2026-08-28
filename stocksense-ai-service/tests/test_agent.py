"""
Unit tests and evaluation suite for the Stateful AI Research Agent.
Verifies tool selection precision, max tool calls limits, and validation.
"""
import sys
import os
# Add root folder to sys.path so we can import app modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.agent.agent import StatefulAgent, AgentState

def test_agent_tool_selection():
    agent = StatefulAgent()
    
    # Query 1: Technical trend questions
    state1 = AgentState(query="What is the RSI and trend of NVDA?", symbol="NVDA")
    agent._determine_tools(state1)
    # Must include TechnicalAnalysisTool and its dependency MarketDataTool
    assert "TechnicalAnalysisTool" in state1.selected_tools
    assert "MarketDataTool" in state1.selected_tools

    # Query 2: News questions
    state2 = AgentState(query="Give me recent news drivers for Tesla", symbol="TSLA")
    agent._determine_tools(state2)
    assert "NewsTool" in state2.selected_tools
    assert "SentimentTool" in state2.selected_tools

def test_agent_tool_calls_bounded():
    agent = StatefulAgent()
    # Mock tool call count limit check
    state = AgentState(query="Analyze MSFT", symbol="MSFT")
    # Artificially set call count to max limit
    state.tool_call_count = 5
    state.selected_tools = ["MarketDataTool", "NewsTool"]
    
    agent._execute_tools(state)
    # Check that execution logged limit error rather than running more
    assert len(state.errors) > 0
    assert "Max tool calls limit" in state.errors[0]

def test_agent_invalid_ticker_degradation():
    agent = StatefulAgent()
    # Run end-to-end on invalid symbol
    # Should complete successfully returning a fallback structured JSON instead of raising Exception
    res = agent.execute("INVALID_TICKER_XYZ", "What is the price of this stock?")
    
    assert res is not None
    assert res["symbol"] == "INVALID_TICKER_XYZ"
    assert res["market"]["price"] == 0.0
    assert "deterministic analysis" in res["summary"].lower() or "neutral" in res["summary"].lower()
