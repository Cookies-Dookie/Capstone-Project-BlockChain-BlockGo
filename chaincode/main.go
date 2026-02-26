package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"

	"github.com/hyperledger/fabric-chaincode-go/v2/shim"
	pb "github.com/hyperledger/fabric-protos-go-apiv2/peer"
)

type SmartContract struct{}

func (cc *SmartContract) Init(stub shim.ChaincodeStubInterface) *pb.Response {
	log.Println("Registrar chaincode Init called")
	return shim.Success([]byte("OK"))
}

func (cc *SmartContract) Invoke(stub shim.ChaincodeStubInterface) *pb.Response {
	function, args := stub.GetFunctionAndParameters()
	log.Printf("Invoke: function=%s, args=%v\n", function, args)

	switch function {
	case "RecordGrade":
		return recordGrade(stub, args)
	case "ReadGrade":
		return readGrade(stub, args)
	case "GetHistory":
		return getHistory(stub, args)
	default:
		return shim.Error(fmt.Sprintf("Unknown function: %s", function))
	}
}

func recordGrade(stub shim.ChaincodeStubInterface, args []string) *pb.Response {
	if len(args) < 1 {
		return shim.Error("recordGrade needs JSON argument")
	}

	var record map[string]interface{}
	if err := json.Unmarshal([]byte(args[0]), &record); err != nil {
		return shim.Error(fmt.Sprintf("Invalid JSON: %v", err))
	}

	recordID, ok := record["record_id"].(string)
	if !ok || recordID == "" {
		return shim.Error("Missing record_id")
	}

	// Check if exists
	existing, err := stub.GetState(recordID)
	if err != nil {
		return shim.Error(fmt.Sprintf("GetState error: %v", err))
	}
	if existing != nil {
		return shim.Error(fmt.Sprintf("Record %s already exists", recordID))
	}

	// Store
	recordJSON, _ := json.Marshal(record)
	if err := stub.PutState(recordID, recordJSON); err != nil {
		return shim.Error(fmt.Sprintf("PutState error: %v", err))
	}

	// Emit event
	stub.SetEvent("RecordCreated", recordJSON)

	return shim.Success([]byte(fmt.Sprintf(`{"status":"success","recordID":"%s"}`, recordID)))
}

func readGrade(stub shim.ChaincodeStubInterface, args []string) *pb.Response {
	if len(args) < 1 {
		return shim.Error("readGrade needs recordID")
	}

	recordID := args[0]
	value, err := stub.GetState(recordID)
	if err != nil {
		return shim.Error(fmt.Sprintf("GetState error: %v", err))
	}

	if value == nil {
		return shim.Error(fmt.Sprintf("Record %s not found", recordID))
	}

	return shim.Success(value)
}

func getHistory(stub shim.ChaincodeStubInterface, args []string) *pb.Response {
	if len(args) < 1 {
		return shim.Error("getHistory needs recordID")
	}

	recordID := args[0]
	iter, err := stub.GetHistoryForKey(recordID)
	if err != nil {
		return shim.Error(fmt.Sprintf("GetHistoryForKey error: %v", err))
	}
	defer iter.Close()

	var history []interface{}
	for iter.HasNext() {
		kv, _ := iter.Next()
		history = append(history, map[string]interface{}{
			"TxId":      kv.TxId,
			"Timestamp": kv.Timestamp,
			"IsDelete":  kv.IsDelete,
			"Value":     string(kv.Value),
		})
	}

	result, _ := json.Marshal(history)
	return shim.Success(result)
}

func main() {
	chaincode := &shim.ChaincodeServer{
		CCID:    os.Getenv("CHAINCODE_ID"),
		Address: os.Getenv("CHAINCODE_SERVER_ADDRESS"),
		CC:      &SmartContract{},
	}

	log.Printf("Starting CCAAS Registrar Chaincode\n")
	log.Printf("CHAINCODE_ID: %s\n", chaincode.CCID)
	log.Printf("CHAINCODE_SERVER_ADDRESS: %s\n", chaincode.Address)

	if err := chaincode.Start(); err != nil {
		log.Fatalf("Chaincode start failed: %v\n", err)
	}
}
